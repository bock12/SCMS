import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Home, Users, Calendar, DollarSign, Video, Settings, 
  Menu, X, Bell, User, LogOut, LayoutDashboard,
  ShieldCheck, MapPin, Share2, ClipboardList, AlertCircle, Search, Filter, Plus, 
  CheckCircle2, Clock, Play, Radio, MessageSquare, Send, BookOpen, Heart, Sparkles, ChevronRight, ChevronLeft, ChevronDown, ArrowRight,
  Building2, Layers, Church, Gift, FileText, Download, Check, ShieldAlert, Award, Trophy, Star,
  Printer, Upload, UserPlus, UserMinus, Trash2, Edit, Eye, Key, QrCode, Landmark, ShoppingCart, FileCode, CreditCard, Camera
} from 'lucide-react';
import { supabase, resetLocalDatabase } from './supabaseClient';
import type { Profile, ChurchBranch, Stream, ChatMessage, Ministry, FinancialRecord, PrayerRequest, ChurchEvent, EventRegistration, GivingConfig, DepartmentRequisition, RequisitionItem, MembershipStatus, PortalAccountStatus, AppRole } from './types';
import AdminDashboard, { StreamDetailsPage } from './AdminDashboard';
import { FinanceOfficerWorkspace } from './FinanceOfficerWorkspace';
import { MemberResourcesPage } from './MemberResourcesPage';
import { MemberEventSurveysPage } from './MemberEventSurveysPage';
import { getGivingConfig } from './givingConfig';
import { getRequisitions, saveRequisitions, getDepartmentFinancialStanding } from './requisitionService';
import { getDepartmentLedgerRecords, saveDepartmentLedgerRecord, deleteDepartmentLedgerRecord, getDepartmentLedgerSummary } from './departmentLedgerService';
import { ReceiptDocumentScanner } from './ReceiptDocumentScanner';
import type { DepartmentLedgerRecord } from './types';
import { getRecurrenceBadge, getEventAccount } from './eventAccountService';
import { getChurchProfile } from './churchProfileService';
import { getMembers, hasPortalAccess, registerUnifiedMember, updateUnifiedMember, updateMembershipStatus, updatePortalAccountStatus, enablePortalAccess, disablePortalAccess, type PortalInvitationInfo } from './memberService';
import { 
  getMemberContributions, 
  saveMemberContribution, 
  getMemberWelfareCard, 
  getDeptWelfareSummary, 
  getWelfareReasonLabel, 
  getCategoryBadgeColor, 
  generateWelfareCardNumber,
  getWelfareCampaigns,
  saveWelfareCampaign,
  getCampaignProgress,
  getMemberReciprocityRating,
  getMemberActionableTasks
} from './welfareContributionService';
import type { MemberContribution, MemberWelfareCard, WelfareCampaignDrive, ContributionCategory, WelfareReason } from './types';
import {
  getDepartmentNotifications,
  sendInAppNotification,
  sendDriveReminderToPendingMembers,
  sendMonthlyDuesReminderToPendingMembers,
  markNotificationAsRead,
  markAllDeptNotificationsAsRead,
  deleteNotification
} from './inAppNotificationService';
import type { InAppNotification } from './inAppNotificationService';

const renderStyledMainTitle = (titleStr?: string) => {
  const title = (titleStr || 'FaithConnect').trim();
  if (title === 'FaithConnect') {
    return <>Faith<span className="text-indigo-600">Connect</span></>;
  }

  const camelMatch = title.match(/^([A-Z][a-z0-9]+)([A-Z][a-zA-Z0-9]+)$/);
  if (camelMatch) {
    return <>{camelMatch[1]}<span className="text-indigo-600">{camelMatch[2]}</span></>;
  }

  const parts = title.split(' ');
  if (parts.length > 1) {
    const firstPart = parts.slice(0, -1).join(' ');
    const lastPart = parts[parts.length - 1];
    return <>{firstPart} <span className="text-indigo-600">{lastPart}</span></>;
  }

  return title;
};

const getPortalPageMeta = (pathname: string, search: string): { section: string; title: string } => {
  if (pathname.startsWith('/portal/admin/streaming')) {
    return { section: 'Pastoral & Admin', title: 'Stream Broadcast Studio' };
  }
  if (pathname === '/portal/admin') {
    const tab = new URLSearchParams(search).get('tab') || 'overview';
    const tabTitles: Record<string, string> = {
      overview: 'Admin Overview',
      events: 'Events & Calendar',
      resources: 'Church Resources',
      surveys: 'Post-Event Surveys',
      users: 'Congregation Roster',
      roles: 'Roles & Governance',
      ministries: 'Departments & Teams',
      financials: 'Tithes & Giving Ledger',
      streaming: 'Broadcast Studio',
      multitenant: 'Multi-Tenant Roadmap',
      settings: 'Church Settings'
    };
    return {
      section: tab === 'financials' ? 'Finance & Treasury' : 'Pastoral & Admin',
      title: tabTitles[tab] || 'Admin Dashboard'
    };
  }
  const routeTitles: Record<string, { section: string; title: string }> = {
    '/portal': { section: 'Member Portal', title: 'Church Overview' },
    '/portal/directory': { section: 'Member Portal', title: 'Member Directory' },
    '/portal/ministries': { section: 'Member Portal', title: 'Ministries & Teams' },
    '/portal/calendar': { section: 'Member Portal', title: 'Events & Calendar' },
    '/portal/resources': { section: 'Member Portal', title: 'Church Resources' },
    '/portal/surveys': { section: 'Member Portal', title: 'Event Feedback' },
    '/portal/streaming': { section: 'Member Portal', title: 'Live Sanctuary' },
    '/portal/giving': { section: 'Member Portal', title: 'Giving & Tithes' },
    '/portal/prayer': { section: 'Member Portal', title: 'Prayer Wall' },
    '/portal/profile': { section: 'Member Portal', title: 'My Profile' },
    '/portal/leader': { section: 'Department Leadership', title: 'Ministry Leader Console' },
    '/portal/finance': { section: 'Finance & Treasury', title: 'Financial Officer Console' }
  };
  return routeTitles[pathname] || { section: 'Portal', title: 'FaithConnect' };
};

// --- Global Navbar ---

const Navbar = ({ 
  profile, 
  onOpenAuth,
  onToggleMobileMenu,
  inPortal = false
}: { 
  profile: Profile | null;
  onOpenAuth?: (isSignUp?: boolean) => void;
  onToggleMobileMenu?: () => void;
  inPortal?: boolean;
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [churchProfile, setChurchProfile] = useState(() => getChurchProfile());
  const portalMeta = getPortalPageMeta(location.pathname, location.search);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) setChurchProfile(e.detail);
      else setChurchProfile(getChurchProfile());
    };
    window.addEventListener('church-profile-updated', handleUpdate);
    return () => window.removeEventListener('church-profile-updated', handleUpdate);
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <nav
      className={`${
        inPortal
          ? 'sticky top-0 z-30 w-full'
          : 'fixed top-0 inset-x-0 z-40 shadow-sm'
      } h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between gap-3 px-4 sm:px-6`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Mobile Hamburger Menu Toggle (Portal only) */}
        {inPortal && profile && onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 -ml-1 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
            aria-label="Toggle navigation menu"
          >
            <Menu size={22} />
          </button>
        )}

        {/* Brand Logo & Title: Always shown on public Navbar, and on mobile (< md) in Portal */}
        <div className={`flex items-center gap-2.5 min-w-0 ${inPortal ? 'md:hidden' : ''}`}>
          <Link to="/" className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-extrabold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-colors overflow-hidden shrink-0">
            {churchProfile.logo_url ? (
              <img src={churchProfile.logo_url} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              'FC'
            )}
          </Link>
          <div className="flex flex-col min-w-0">
            <Link to="/" className="text-lg sm:text-xl font-black text-slate-900 leading-none tracking-tight truncate">
              {renderStyledMainTitle(churchProfile.main_title || 'FaithConnect')}
            </Link>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight truncate max-w-[160px] sm:max-w-[240px]">
                {churchProfile.subtle_title || 'Grace Cathedral'}
              </span>
            </div>
          </div>
        </div>

        {/* Desktop Portal Contextual Header (Merged seamlessly beside Sidebar) */}
        {inPortal && (
          <div className="hidden md:flex items-center gap-2.5 min-w-0">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-extrabold uppercase tracking-wider shrink-0">
              {portalMeta.section}
            </span>
            <ChevronRight size={14} className="text-slate-300 shrink-0" />
            <span className="text-sm font-black text-slate-900 truncate">
              {portalMeta.title}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {profile ? (
          <>
            <Link 
              to="/portal" 
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors shrink-0"
            >
              <LayoutDashboard size={14} />
              <span>Overview</span>
            </Link>

            <Link 
              to="/portal/streaming" 
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors shrink-0"
              title="Watch Live"
            >
              <Radio size={14} className="animate-pulse shrink-0" />
              <span className="hidden sm:inline">Watch Live</span>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-slate-200 shrink-0">
              <div className="text-right hidden lg:block max-w-[160px]">
                <p className="text-sm font-bold text-slate-900 leading-none truncate">
                  {profile.first_name} {profile.last_name}
                </p>
                <p className="text-xs text-indigo-600 font-semibold capitalize mt-0.5 truncate">
                  {profile.primary_role?.replace('_', ' ') || 'Member'}
                </p>
              </div>

              <Link 
                to="/portal/profile" 
                title="View Profile" 
                className="w-9 h-9 bg-slate-100 rounded-full overflow-hidden border-2 border-indigo-200 hover:border-indigo-600 transition-colors flex items-center justify-center text-slate-600 shrink-0"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={18} />
                )}
              </Link>

              <button 
                type="button"
                onClick={handleSignOut} 
                title="Sign Out" 
                aria-label="Sign Out"
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <LogOut size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={() => onOpenAuth ? onOpenAuth(false) : navigate('/auth')} 
              className="px-4 py-2 text-slate-700 hover:text-indigo-600 font-bold text-sm transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button 
              type="button"
              onClick={() => onOpenAuth ? onOpenAuth(true) : navigate('/auth?signup=true')} 
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 cursor-pointer"
            >
              Create Account
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

// --- Portal Sidebar (Desktop & Mobile Slide-Over Drawer with Collapsible Role Categories) ---

interface SidebarProps {
  role: string;
  profile?: Profile | null;
  mobileOpen?: boolean;
  onClose?: () => void;
  desktopCollapsed?: boolean;
  onToggleDesktopCollapse?: () => void;
}

type SidebarSectionKey = 'church' | 'finance' | 'leader' | 'admin';

const Sidebar: React.FC<SidebarProps> = ({
  role,
  profile,
  mobileOpen = false,
  onClose,
  desktopCollapsed = false,
  onToggleDesktopCollapse
}) => {
  const location = useLocation();
  const [churchProfile, setChurchProfile] = useState(() => getChurchProfile());

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) setChurchProfile(e.detail);
      else setChurchProfile(getChurchProfile());
    };
    window.addEventListener('church-profile-updated', handleUpdate);
    return () => window.removeEventListener('church-profile-updated', handleUpdate);
  }, []);

  const isLeaderOrStaff = ['admin', 'super_admin', 'pastor', 'district_admin', 'leader', 'worker'].includes(role) || Boolean(profile?.assigned_department || profile?.department_name);
  const isAdminOrPastor = ['admin', 'super_admin', 'pastor', 'district_admin'].includes(role);
  const isFinanceOfficer = role === 'finance_officer';
  const canAccessFinance = isFinanceOfficer || isAdminOrPastor;
  const hasMultipleRoleSections = isLeaderOrStaff || canAccessFinance || isAdminOrPastor;

  const getActiveSectionForRoute = (pathname: string, search: string): SidebarSectionKey => {
    if (pathname.startsWith('/portal/admin')) {
      const tab = new URLSearchParams(search).get('tab');
      if (tab === 'financials') return 'finance';
      return 'admin';
    }
    if (pathname === '/portal/finance') return 'finance';
    if (pathname === '/portal/leader') return 'leader';
    return 'church';
  };

  const [openSections, setOpenSections] = useState<Record<SidebarSectionKey, boolean>>(() => {
    const active = getActiveSectionForRoute(location.pathname, location.search);
    return {
      church: active === 'church' || !hasMultipleRoleSections,
      finance: active === 'finance' || (isFinanceOfficer && !isAdminOrPastor),
      leader: active === 'leader' || (isLeaderOrStaff && !isAdminOrPastor),
      admin: active === 'admin'
    };
  });

  useEffect(() => {
    const active = getActiveSectionForRoute(location.pathname, location.search);
    setOpenSections(prev => (prev[active] ? prev : { ...prev, [active]: true }));
  }, [location.pathname, location.search]);

  const toggleSection = (section: SidebarSectionKey) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const churchLifeLinks = [
    { to: '/portal', icon: Home, label: 'Church Overview' },
    { to: '/portal/directory', icon: Users, label: 'Member Directory' },
    { to: '/portal/ministries', icon: Building2, label: 'Ministries & Teams' },
    { to: '/portal/calendar', icon: Calendar, label: 'Events & Calendar' },
    { to: '/portal/resources', icon: BookOpen, label: 'Church Resources' },
    { to: '/portal/surveys', icon: ClipboardList, label: 'Event Feedback' },
    { to: '/portal/streaming', icon: Video, label: 'Live Sanctuary' },
    { to: '/portal/giving', icon: DollarSign, label: 'Giving & Tithes' },
    { to: '/portal/prayer', icon: Heart, label: 'Prayer Wall' },
    { to: '/portal/profile', icon: User, label: 'My Profile' }
  ];

  const leaderLinks = isLeaderOrStaff ? [
    { to: '/portal/leader', icon: Award, label: 'Ministry Leader Console' }
  ] : [];

  const financeLinks = canAccessFinance ? [
    { to: '/portal/finance', icon: Landmark, label: 'Financial Officer Console' },
    { to: '/portal/admin?tab=financials', icon: DollarSign, label: 'Tithes & Giving Ledger' }
  ] : [];

  const adminLinks = isAdminOrPastor ? [
    { to: '/portal/admin?tab=overview', icon: LayoutDashboard, label: 'Admin Overview' },
    { to: '/portal/admin?tab=events', icon: Calendar, label: 'Events & Calendar' },
    { to: '/portal/admin?tab=resources', icon: FileText, label: 'Church Resources' },
    { to: '/portal/admin?tab=surveys', icon: ClipboardList, label: 'Post-Event Surveys' },
    { to: '/portal/admin?tab=users', icon: Users, label: 'Congregation Roster' },
    { to: '/portal/admin?tab=roles', icon: ShieldCheck, label: 'Roles & Governance' },
    { to: '/portal/admin?tab=ministries', icon: Building2, label: 'Departments & Teams' },
    { to: '/portal/admin?tab=streaming', icon: Video, label: 'Broadcast Studio' },
    { to: '/portal/admin?tab=multitenant', icon: Layers, label: 'Multi-Tenant Roadmap' },
    { to: '/portal/admin?tab=settings', icon: Settings, label: 'Church Settings' }
  ] : [];

  const renderContent = (isCollapsed: boolean) => (
    <div className="flex flex-col h-full bg-white">
      {/* Unified Top Brand Row (Exact h-16 height to merge seamlessly with Portal Header) */}
      <div className={`${isCollapsed ? 'px-2 justify-center gap-1' : 'px-4 justify-between gap-2'} h-16 shrink-0 border-b border-slate-200 flex items-center`}>
        <Link
          to="/portal"
          onClick={onClose}
          title={churchProfile.main_title || 'FaithConnect'}
          className="flex items-center gap-2.5 min-w-0"
        >
          <div className={`${isCollapsed ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm'} bg-indigo-600 rounded-xl flex items-center justify-center text-white font-extrabold shadow-sm shadow-indigo-100 hover:bg-indigo-700 transition-colors overflow-hidden shrink-0`}>
            {churchProfile.logo_url ? (
              <img src={churchProfile.logo_url} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              'FC'
            )}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex flex-col">
              <span className="text-base font-black text-slate-900 leading-none tracking-tight truncate">
                {renderStyledMainTitle(churchProfile.main_title || 'FaithConnect')}
              </span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight truncate mt-0.5">
                {churchProfile.subtle_title || 'Grace Cathedral'}
              </span>
            </div>
          )}
        </Link>

        {onToggleDesktopCollapse && (
          <button
            type="button"
            onClick={onToggleDesktopCollapse}
            className="hidden md:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 cursor-pointer shrink-0 transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={18} />}
          </button>
        )}

        {onClose && !isCollapsed && (
          <button 
            type="button"
            onClick={onClose} 
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className={`${isCollapsed ? 'p-2.5 space-y-3' : 'p-3.5 space-y-3'} flex-1 overflow-y-auto`}>
        {/* Pastoral & Administration Category (Admin, Super Admin, Pastor ONLY) */}
        {isAdminOrPastor && (
          <div className="space-y-1">
            {!isCollapsed && (
              <button
                type="button"
                onClick={() => toggleSection('admin')}
                className="w-full px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold text-indigo-700 uppercase tracking-widest flex items-center justify-between hover:bg-indigo-50/70 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span>Pastoral & Admin</span>
                  <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-black">Staff</span>
                </span>
                <ChevronDown size={14} className={`transition-transform duration-150 ${openSections.admin ? 'rotate-0' : '-rotate-90'}`} />
              </button>
            )}
            {(isCollapsed || openSections.admin) && (
              <div className="space-y-1 pt-0.5">
                {adminLinks.map((link) => {
                  const currentFull = location.pathname + location.search;
                  const isActive = currentFull === link.to || (link.to.includes('tab=overview') && location.pathname === '/portal/admin' && !location.search);
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={onClose}
                      title={isCollapsed ? link.label : undefined}
                      aria-label={link.label}
                      className={`flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2'} rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'
                      }`}
                    >
                      <link.icon size={isCollapsed ? 18 : 16} className="shrink-0" />
                      {!isCollapsed && <span className="truncate">{link.label}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Finance & Treasury Category (Finance Officer, Pastor, Admin) */}
        {canAccessFinance && (
          <div className={`space-y-1 ${isAdminOrPastor ? 'pt-3 border-t border-slate-100' : ''}`}>
            {!isCollapsed && (
              <button
                type="button"
                onClick={() => toggleSection('finance')}
                className="w-full px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold text-emerald-700 uppercase tracking-widest flex items-center justify-between hover:bg-emerald-50/70 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span>Finance & Treasury</span>
                  <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-black">Treasury</span>
                </span>
                <ChevronDown size={14} className={`transition-transform duration-150 ${openSections.finance ? 'rotate-0' : '-rotate-90'}`} />
              </button>
            )}
            {(isCollapsed || openSections.finance) && (
              <div className="space-y-1 pt-0.5">
                {financeLinks.map((link) => {
                  const currentFull = location.pathname + location.search;
                  const isActive = currentFull === link.to;
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={onClose}
                      title={isCollapsed ? link.label : undefined}
                      aria-label={link.label}
                      className={`flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2'} rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100'
                          : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                      }`}
                    >
                      <link.icon size={isCollapsed ? 18 : 16} className="shrink-0" />
                      {!isCollapsed && <span className="truncate">{link.label}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Ministry Leadership Category (Leader, Worker, Pastor, Admin) */}
        {isLeaderOrStaff && (
          <div className={`space-y-1 ${(isAdminOrPastor || canAccessFinance) ? 'pt-3 border-t border-slate-100' : ''}`}>
            {!isCollapsed && (
              <button
                type="button"
                onClick={() => toggleSection('leader')}
                className="w-full px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold text-amber-700 uppercase tracking-widest flex items-center justify-between hover:bg-amber-50/70 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span>Department Leadership</span>
                  <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-black">Leaders</span>
                </span>
                <ChevronDown size={14} className={`transition-transform duration-150 ${openSections.leader ? 'rotate-0' : '-rotate-90'}`} />
              </button>
            )}
            {(isCollapsed || openSections.leader) && (
              <div className="space-y-1 pt-0.5">
                {leaderLinks.map((link) => {
                  const isActive = location.pathname === link.to;
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={onClose}
                      title={isCollapsed ? link.label : undefined}
                      aria-label={link.label}
                      className={`flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2'} rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-amber-600 text-white shadow-md shadow-amber-100'
                          : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                      }`}
                    >
                      <link.icon size={isCollapsed ? 18 : 16} className="shrink-0" />
                      {!isCollapsed && <span className="truncate">{link.label}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Church Life / Member Portal Category (All Roles) */}
        <div className={`space-y-1 ${hasMultipleRoleSections ? 'pt-3 border-t border-slate-100' : ''}`}>
          {!isCollapsed && (
            hasMultipleRoleSections ? (
              <button
                type="button"
                onClick={() => toggleSection('church')}
                className="w-full px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center justify-between hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span>Member Portal</span>
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-black">Member</span>
                </span>
                <ChevronDown size={14} className={`transition-transform duration-150 ${openSections.church ? 'rotate-0' : '-rotate-90'}`} />
              </button>
            ) : (
              <p className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">
                Church Ministry
              </p>
            )
          )}
          {(isCollapsed || !hasMultipleRoleSections || openSections.church) && (
            <div className="space-y-1 pt-0.5">
              {churchLifeLinks.map((link) => {
                const isActive = location.pathname === link.to && !location.search;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={onClose}
                    title={isCollapsed ? link.label : undefined}
                    aria-label={link.label}
                    className={`flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2'} rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'
                    }`}
                  >
                    <link.icon size={isCollapsed ? 18 : 16} className="shrink-0" />
                    {!isCollapsed && <span className="truncate">{link.label}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Inspirational Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <p className="text-[11px] text-slate-700 italic font-serif leading-relaxed">
              "For where two or three gather in my name, there am I with them."
            </p>
            <p className="text-[10px] font-bold text-indigo-600 mt-1 text-right">— Matthew 18:20</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Collapsible Sidebar (Full-height sticky shell seamlessly merged with header) */}
      <aside
        className={`hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen shrink-0 ${
          desktopCollapsed ? 'w-20' : 'w-64'
        } bg-white border-r border-slate-200 z-30 transition-[width] duration-200`}
      >
        {renderContent(desktopCollapsed)}
      </aside>

      {/* Mobile Slide-Over Drawer with Backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
            onClick={onClose} 
          />
          <aside className="relative w-72 max-w-[85vw] h-full bg-white shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {renderContent(false)}
          </aside>
        </div>
      )}
    </>
  );
};

// --- Auth Modal & Page with the "X" Close Button ---

interface AuthCardProps {
  initialSignUp?: boolean;
  initialSetupToken?: string;
  initialEmail?: string;
  onClose?: () => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  initialSignUp = false,
  initialSetupToken = '',
  initialEmail = '',
  onClose
}) => {
  const [isSignUp, setIsSignUp] = useState(initialSignUp);
  const [isSetupMode, setIsSetupMode] = useState(Boolean(initialSetupToken));
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState(initialSetupToken);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    if (initialSetupToken) {
      setIsSetupMode(true);
      setSetupToken(initialSetupToken);
      if (initialEmail) setEmail(initialEmail);
    } else {
      setIsSignUp(initialSignUp);
    }
  }, [initialSignUp, initialSetupToken, initialEmail]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate('/');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (isSetupMode) {
        const { error: setupErr } = await supabase.auth.completePasswordSetup({
          email: email.trim(),
          setupToken: setupToken.trim(),
          newPassword: password
        });
        if (setupErr) throw setupErr;

        setSuccessMsg("Portal access activated! Redirecting to your portal...");
        setTimeout(() => {
          if (onClose) onClose();
          navigate('/portal');
        }, 700);
      } else if (isSignUp) {
        const { error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              first_name: firstName.trim() || 'Faithful',
              last_name: lastName.trim() || 'Member',
              phone: phone.trim(),
              primary_role: role,
              branch_id: 'branch-1'
            }
          }
        });

        if (signUpErr) throw signUpErr;

        setSuccessMsg("Account created successfully! Welcome to Grace Cathedral.");
        setTimeout(() => {
          if (onClose) onClose();
          navigate('/portal');
        }, 800);
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (signInErr) throw signInErr;

        setSuccessMsg("Login successful! Redirecting...");
        setTimeout(() => {
          if (onClose) onClose();
          navigate('/portal');
        }, 500);
      }
    } catch (err: any) {
      setError(err?.message || "An authentication error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Quick 1-click Demo Login
  const handleQuickDemo = async (demoEmail: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error: demoErr } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: 'password123'
      });
      if (demoErr) throw demoErr;
      if (onClose) onClose();
      navigate('/portal');
    } catch (err: any) {
      setError(err?.message || "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
      {/* Prominent 'X' Close Button */}
      <button 
        type="button"
        onClick={handleClose}
        aria-label="Close dialog"
        title="Close form"
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-all cursor-pointer z-30 focus:outline-none focus:ring-2 focus:ring-white"
      >
        <X size={20} />
      </button>

      {/* Header Banner */}
      <div className="p-8 text-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-800 text-white relative">
        <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-md shadow-inner">
          <ShieldCheck size={28} className="text-white" />
        </div>
        <h2 className="text-2xl font-black tracking-tight">FaithConnect</h2>
        <p className="text-indigo-100 text-xs mt-1">
          {isSetupMode
            ? 'Activate Your Portal Invitation & Set Password'
            : isSignUp
            ? 'Join Grace Cathedral Church Community'
            : 'Welcome back to Grace Cathedral Portal'}
        </p>
      </div>

      {/* Form Content */}
      <form onSubmit={handleAuth} className="p-6 sm:p-8 space-y-4 max-h-[75vh] overflow-y-auto">
        {error && (
          <div className="p-3.5 text-sm font-semibold rounded-xl border bg-rose-50 text-rose-700 border-rose-200 flex items-start gap-2.5">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 text-sm font-semibold rounded-xl border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-2.5">
            <CheckCircle2 size={18} className="flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {isSignUp && !isSetupMode && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase">First Name</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-sm font-medium transition-all"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Samuel"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase">Last Name</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-sm font-medium transition-all"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Adebayo"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase">Phone Number</label>
              <input 
                type="tel" 
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-sm font-medium transition-all"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase">Member Role</label>
              <select 
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-medium cursor-pointer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="member">Member</option>
                <option value="worker">Church Worker / Volunteer</option>
                <option value="leader">Ministry Leader</option>
                <option value="pastor">Pastor</option>
                <option value="super_admin">Senior Pastor / Church Admin</option>
              </select>
            </div>
          </>
        )}

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600 uppercase">Email Address</label>
          <input 
            type="email" 
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-sm font-medium transition-all"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="yourname@domain.com"
            required
          />
        </div>

        {isSetupMode && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase">Activation Token</label>
            <input 
              type="text" 
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-xs font-mono transition-all"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              placeholder="setup_..."
              required
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600 uppercase">
            {isSetupMode ? 'Choose New Password (min 6 characters)' : 'Password'}
          </label>
          <input 
            type="password" 
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-sm font-medium transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-3.5 mt-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <span>Processing...</span>
          ) : (
            <span>
              {isSetupMode
                ? 'Activate Portal & Sign In'
                : isSignUp
                ? 'Create My Account'
                : 'Sign In to Portal'}
            </span>
          )}
        </button>

        <div className="pt-2 text-center space-y-1.5">
          {!isSetupMode && (
            <button 
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer block mx-auto"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account yet? Create one"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsSetupMode(!isSetupMode);
              setIsSignUp(false);
              setError(null);
            }}
            className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer block mx-auto"
          >
            {isSetupMode ? 'Back to Standard Sign In' : 'Have an invitation token? Activate Portal Access'}
          </button>
        </div>

        {/* 1-Click Demo Accounts */}
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2 text-center">
            ⚡ Quick 1-Click Demo Accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickDemo('admin@faithconnect.church')}
              className="p-2 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all group cursor-pointer"
            >
              <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">Pastor David</div>
              <div className="text-[10px] text-slate-400 font-semibold">Church Admin</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('pastor@faithconnect.church')}
              className="p-2 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all group cursor-pointer"
            >
              <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">Rev. Sarah</div>
              <div className="text-[10px] text-slate-400 font-semibold">Lead Pastor</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('worship@faithconnect.church')}
              className="p-2 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all group cursor-pointer"
            >
              <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">Hannah Adams</div>
              <div className="text-[10px] text-slate-400 font-semibold">Worship Leader</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('member@faithconnect.church')}
              className="p-2 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all group cursor-pointer"
            >
              <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">Grace Campbell</div>
              <div className="text-[10px] text-slate-400 font-semibold">Active Member</div>
            </button>
          </div>
        </div>

        {/* Back to Home Link */}
        <div className="text-center pt-2">
          <button 
            type="button" 
            onClick={handleClose} 
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1 mx-auto cursor-pointer"
          >
            <X size={14} /> Close and return to home
          </button>
        </div>
      </form>
    </div>
  );
};

// --- Direct /auth route wrapper ---
const AuthRoutePage = ({ profile, session }: { profile: Profile | null; session: any }) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialSignUp = searchParams.get('signup') === 'true';
  const initialSetupToken = searchParams.get('setup') || '';
  const initialEmail = searchParams.get('email') || '';
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 md:p-6">
      <div className="w-full max-w-md space-y-3">
        {session && profile && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-indigo-900">Signed in as {profile.first_name} {profile.last_name}</p>
              <p className="text-indigo-600 capitalize">{profile.primary_role?.replace('_', ' ')}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/portal')}
              className="px-3.5 py-1.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
            >
              Enter Portal &rarr;
            </button>
          </div>
        )}
        <AuthCard
          initialSignUp={initialSignUp}
          initialSetupToken={initialSetupToken}
          initialEmail={initialEmail}
          onClose={() => navigate('/')}
        />
      </div>
    </div>
  );
};

// --- Portal Overview Page (Single Church Focus) ---

const OverviewPage = ({ profile }: { profile: Profile | null }) => {
  const [churchProfile, setChurchProfile] = useState(() => getChurchProfile());
  const [liveStream, setLiveStream] = useState<Stream | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<ChurchEvent[]>([]);
  const [blessingClaimed, setBlessingClaimed] = useState<Record<string, boolean>>({});
  const [showCelebrationToast, setShowCelebrationToast] = useState(true);

  const [celebrations, setCelebrations] = useState<{
    id: string;
    type: 'birthday' | 'baptism' | 'marriage';
    title: string;
    description: string;
    dateLabel: string;
    years?: number;
    isToday?: boolean;
  }[]>([]);

  useEffect(() => {
    const handleChurchUpdate = () => setChurchProfile(getChurchProfile());
    window.addEventListener('church-profile-updated', handleChurchUpdate);
    return () => window.removeEventListener('church-profile-updated', handleChurchUpdate);
  }, []);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const [{ data: sData }, { data: evData }] = await Promise.all([
          supabase.from('streams').select('*').eq('status', 'live').maybeSingle(),
          supabase.from('church_events').select('*').order('start_time', { ascending: true }).limit(4)
        ]);
        if (!active) return;
        if (sData) setLiveStream(sData as Stream);
        if (evData && Array.isArray(evData)) {
          setUpcomingEvents((evData as ChurchEvent[]).filter(ev => ev.status !== 'cancelled').slice(0, 3));
        }
      } catch (err) {
        console.warn('Unable to load overview highlights:', err);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) return;

    const today = new Date();
    const curMonth = today.getMonth();
    const curDay = today.getDate();
    const curYear = today.getFullYear();

    const activeList: {
      id: string;
      type: 'birthday' | 'baptism' | 'marriage';
      title: string;
      description: string;
      dateLabel: string;
      years?: number;
      isToday?: boolean;
    }[] = [];

    // 1. Scan Birthday
    const dob = profile.date_of_birth;
    if (dob) {
      const d = new Date(dob);
      if (!Number.isNaN(d.getTime()) && d.getMonth() === curMonth) {
        const isToday = d.getDate() === curDay;
        activeList.push({
          id: 'bday',
          type: 'birthday',
          title: isToday ? `Happy Birthday, ${profile.first_name}` : `Birthday Month Celebration`,
          description: isToday
            ? `Your church family rejoices with you today. "The Lord bless you and keep you." (Numbers 6:24)`
            : `Celebrating your birthday this month (${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}). May God's favor surround you.`,
          dateLabel: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
          isToday
        });
      }
    }

    // 2. Scan Water Baptism Anniversary
    const bapDate = profile.baptism_date;
    if (bapDate) {
      const bd = new Date(bapDate);
      if (!Number.isNaN(bd.getTime()) && bd.getMonth() === curMonth) {
        const years = Math.max(1, curYear - bd.getFullYear());
        const isToday = bd.getDate() === curDay;
        activeList.push({
          id: 'baptism',
          type: 'baptism',
          title: `${years}-Year Water Baptism Anniversary`,
          description: isToday
            ? `Today marks ${years} years since your water baptism. "The new creation has come." (2 Cor 5:17)`
            : `Commemorating ${years} years since your water baptism (${bd.toLocaleDateString([], { month: 'short', day: 'numeric' })}).`,
          dateLabel: bd.toLocaleDateString([], { month: 'short', day: 'numeric' }),
          years,
          isToday
        });
      }
    }

    // 3. Scan Wedding / Marriage Anniversary (only when married with a recorded date)
    if (profile.marital_status === 'Married' && profile.marriage_date) {
      const md = new Date(profile.marriage_date);
      if (!Number.isNaN(md.getTime()) && md.getMonth() === curMonth) {
        const years = Math.max(1, curYear - md.getFullYear());
        const isToday = md.getDate() === curDay;
        activeList.push({
          id: 'marriage',
          type: 'marriage',
          title: `${years}-Year Wedding Anniversary`,
          description: isToday
            ? `Happy Wedding Anniversary today. May your home be filled with peace and abundant grace.`
            : `Celebrating ${years} years of Holy Matrimony (${md.toLocaleDateString([], { month: 'short', day: 'numeric' })}).`,
          dateLabel: md.toLocaleDateString([], { month: 'short', day: 'numeric' }),
          years,
          isToday
        });
      }
    }

    setCelebrations(activeList);
  }, [profile]);

  const campusLabel = churchProfile.subtle_title || churchProfile.name || 'Grace Cathedral';
  const mainBrandTitle = churchProfile.main_title || 'FaithConnect';
  const formattedRole = (profile?.primary_role || 'member').replace(/_/g, ' ');
  const departmentLabel = profile?.assigned_department || profile?.department_name || 'General Congregation';

  const serviceGatherings = churchProfile.service_times?.length
    ? churchProfile.service_times.map((slot, idx) => ({
        title: slot.includes(':') ? slot.split(':')[0].trim() : `Weekly Gathering ${idx + 1}`,
        time: slot.includes(':') ? slot.split(':').slice(1).join(':').trim() : slot,
        location: `${campusLabel} Main Sanctuary`,
        category: idx === 0 ? 'Main Worship' : 'Weekly Service'
      }))
    : [
        {
          title: 'Sunday Worship Service',
          time: 'Sundays · 9:00 AM & 11:30 AM',
          location: 'Main Sanctuary & Live Broadcast',
          category: 'Main Worship'
        },
        {
          title: 'Midweek Bible Study & Communion',
          time: 'Wednesdays · 7:00 PM',
          location: 'Fellowship Hall & Live Stream',
          category: 'Word & Prayer'
        },
        {
          title: 'Friday Intercessory Prayer Vigil',
          time: 'Fridays · 9:00 PM',
          location: 'Main Sanctuary',
          category: 'Prayer'
        }
      ];

  const familyMilestones = [
    { name: 'Grace Campbell', initials: 'GC', bDate: 'Oct 17, 2022', years: 4, role: 'Active Member' },
    { name: 'Min. Samuel Okonkwo', initials: 'SO', bDate: 'Oct 28, 2021', years: 5, role: 'Youth Leader' },
    { name: 'Elijah Wright', initials: 'EW', bDate: 'Oct 10, 2020', years: 6, role: 'Worship Worker' },
    { name: 'Rebecca Foster', initials: 'RF', bDate: 'Oct 22, 2023', years: 3, role: 'Communion Servant' }
  ];

  const quickActions = [
    {
      to: '/portal/streaming',
      title: 'Live Sanctuary',
      description: 'Join services online and worship together.',
      icon: Video,
      iconClasses: 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white'
    },
    {
      to: '/portal/giving',
      title: 'Giving & Tithes',
      description: 'Contribute tithes, offerings, and special funds.',
      icon: DollarSign,
      iconClasses: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
    },
    {
      to: '/portal/ministries',
      title: 'Ministries & Teams',
      description: 'Serve with choir, ushers, media, or outreach.',
      icon: Building2,
      iconClasses: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'
    },
    {
      to: '/portal/prayer',
      title: 'Prayer Wall',
      description: 'Share requests and pray for church family.',
      icon: Heart,
      iconClasses: 'bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white'
    }
  ];

  return (
    <div className="space-y-5 sm:space-y-6 pb-20 md:pb-12">
      {/* Primary Church Welcome & Broadcast Focal Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 sm:p-7 lg:p-8 text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-indigo-200 font-semibold">
              <span className="text-amber-300 font-bold">{mainBrandTitle}</span>
              <span aria-hidden="true">·</span>
              <span>{campusLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{formattedRole}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
              Welcome, {profile?.first_name || 'Beloved'}
            </h1>

            <p className="text-xs sm:text-sm text-indigo-100/90 leading-relaxed max-w-xl">
              {churchProfile.mission_statement || 'Engage with weekly worship services, stay connected with your ministry team, steward your giving, and submit prayer requests.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch sm:items-center lg:items-stretch xl:items-center gap-2.5 shrink-0">
            {liveStream ? (
              <Link
                to="/portal/streaming"
                className="min-h-[42px] px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Radio size={15} className="shrink-0" />
                <span>Join Live Stream ({liveStream.view_count || 148})</span>
              </Link>
            ) : (
              <Link
                to="/portal/streaming"
                className="min-h-[42px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Play size={15} className="shrink-0" />
                <span>Watch Worship Stream</span>
              </Link>
            )}

            <Link
              to="/portal/giving"
              className="min-h-[42px] px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <DollarSign size={15} className="shrink-0 text-emerald-300" />
              <span>Give Tithe & Offering</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Live Broadcast Alert Strip (shown only during active stream) */}
      {liveStream && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 bg-rose-600 text-white rounded-xl flex items-center justify-center shrink-0">
              <Radio size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="font-black text-rose-700 uppercase tracking-wide">Live Sanctuary Broadcast</span>
                <span aria-hidden="true" className="text-rose-300">·</span>
                <span className="font-bold text-rose-700 tabular-nums">{liveStream.view_count || 148} worshipping online</span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 mt-0.5 truncate">{liveStream.title}</h3>
              {liveStream.description && (
                <p className="text-xs text-slate-600 line-clamp-1">{liveStream.description}</p>
              )}
            </div>
          </div>

          <Link
            to="/portal/streaming"
            className="w-full sm:w-auto min-h-[40px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Play size={14} fill="currentColor" />
            <span>Open Broadcast</span>
          </Link>
        </div>
      )}

      {/* Compact Milestone Celebrations Strip (when applicable) */}
      {showCelebrationToast && celebrations.length > 0 && (
        <section className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles size={16} className="text-amber-700 shrink-0" />
              <h2 className="text-sm font-black text-slate-900 truncate">Personal Milestone Celebrations</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowCelebrationToast(false)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer shrink-0"
              aria-label="Dismiss celebrations"
            >
              <X size={16} />
            </button>
          </div>

          <div className={`grid grid-cols-1 ${celebrations.length > 1 ? 'md:grid-cols-2' : ''} gap-3`}>
            {celebrations.map((item) => {
              const claimed = Boolean(blessingClaimed[item.id]);
              return (
                <div
                  key={item.id}
                  className="bg-white border border-amber-200/80 rounded-xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold text-amber-800">
                      <span>{item.isToday ? 'Today' : 'This Month'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{item.dateLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{campusLabel}</span>
                    </div>
                    <h3 className="text-sm font-black text-slate-900">{item.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {item.type === 'baptism' && (
                      <Link
                        to="/portal/profile"
                        className="min-h-[36px] px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Award size={14} className="text-amber-700 shrink-0" />
                        <span>View Certificate</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={() => setBlessingClaimed(prev => ({ ...prev, [item.id]: true }))}
                      disabled={claimed}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                        claimed
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                      }`}
                    >
                      {claimed ? <CheckCircle2 size={14} /> : <Heart size={14} />}
                      <span>{claimed ? 'Pastoral Blessing Received' : 'Receive Pastoral Blessing'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick Action Navigation Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {quickActions.map((action) => {
          const IconComp = action.icon;
          return (
            <Link
              key={action.to}
              to={action.to}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 transition-colors group flex items-start gap-3.5 min-w-0"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${action.iconClasses}`}>
                <IconComp size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-900 text-sm truncate">{action.title}</h3>
                  <ChevronRight size={15} className="text-slate-400 group-hover:text-indigo-600 shrink-0 transition-colors" />
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{action.description}</p>
              </div>
            </Link>
          );
        })}
      </section>

      {/* Main 12-Column Overview Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* LEFT COLUMN (8 cols on xl+): Weekly Gatherings, Upcoming Events & Family Milestones */}
        <div className="xl:col-span-8 space-y-5 sm:space-y-6 min-w-0">
          {/* Weekly Service Schedule */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-black text-slate-900">Weekly Service Schedule</h2>
                <p className="text-xs text-slate-500">{campusLabel} regular worship times and sanctuary gatherings</p>
              </div>
              <Link
                to="/portal/calendar"
                className="min-h-[36px] px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>View Calendar</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {serviceGatherings.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-white hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 font-black flex items-center justify-center shrink-0 text-xs tabular-nums">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <h3 className="font-bold text-slate-900 text-sm break-words">{item.title}</h3>
                        <span className="text-[11px] font-semibold text-indigo-700">{item.category}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock size={12} className="shrink-0 text-slate-400" />
                          <span>{item.time}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} className="shrink-0 text-slate-400" />
                          <span>{item.location}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link
                    to="/portal/streaming"
                    className="self-start sm:self-center min-h-[36px] px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors inline-flex items-center justify-center whitespace-nowrap shrink-0"
                  >
                    Join Stream
                  </Link>
                </div>
              ))}
            </div>

            {upcomingEvents.length > 0 && (
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Upcoming Church Events</h3>
                  <Link to="/portal/calendar" className="text-xs font-bold text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                    All Events
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {upcomingEvents.map((ev) => (
                    <Link
                      key={ev.id}
                      to="/portal/calendar"
                      className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 hover:border-indigo-300 transition-colors space-y-1 min-w-0"
                    >
                      <p className="text-[11px] font-bold text-indigo-700 tabular-nums truncate">
                        {new Date(ev.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                      <h4 className="font-bold text-slate-900 text-xs truncate">{ev.title}</h4>
                      <p className="text-[11px] text-slate-500 truncate">{ev.location || campusLabel}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Church Family Baptism Anniversaries */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="min-w-0">
                <h2 className="font-black text-slate-900 text-base">Church Family Baptism Anniversaries</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Celebrate water baptism milestones with {campusLabel} brothers and sisters this month
                </p>
              </div>
              <Link
                to="/portal/profile"
                className="self-start sm:self-center min-h-[36px] px-3 py-1.5 text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>My Milestones</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {familyMilestones.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 flex items-center justify-between gap-3 min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 text-amber-800 font-black text-xs flex items-center justify-center shrink-0">
                      {item.initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 text-xs truncate">{item.name}</h3>
                      <p className="text-[11px] text-slate-500 truncate">{item.role}</p>
                      <span className="text-[11px] font-semibold text-amber-800 tabular-nums block">{item.bDate}</span>
                    </div>
                  </div>
                  <span className="text-xs font-black text-amber-800 tabular-nums whitespace-nowrap shrink-0">
                    {item.years} Yrs
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT SIDEBAR COLUMN (4 cols on xl+): 2-Col Side-by-Side on Tablet/Laptop (md-lg), Stacked Sidebar on xl+ */}
        <aside className="xl:col-span-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-5 sm:gap-6 min-w-0">
          {/* Our Church Home Card */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 overflow-hidden">
                  {churchProfile.logo_url ? (
                    <img src={churchProfile.logo_url} alt={churchProfile.name} className="w-full h-full object-cover" />
                  ) : (
                    <Church size={18} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-indigo-700 truncate">{mainBrandTitle}</p>
                  <h2 className="text-base font-black text-slate-900 truncate">Our Church Home</h2>
                  <p className="text-xs text-slate-500 break-words mt-0.5">
                    {churchProfile.address}, {churchProfile.city} · {churchProfile.phone}
                  </p>
                </div>
              </div>

              <dl className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-slate-50/50">
                  <dt className="text-slate-500 font-semibold shrink-0">Senior Pastor</dt>
                  <dd className="font-bold text-slate-900 text-right truncate">{churchProfile.senior_pastor || 'Rev. Sarah Johnson'}</dd>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <dt className="text-slate-500 font-semibold shrink-0">Your Status</dt>
                  <dd className="font-bold text-emerald-700 inline-flex items-center gap-1 shrink-0">
                    <CheckCircle2 size={13} />
                    <span>Active Member</span>
                  </dd>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-slate-50/50">
                  <dt className="text-slate-500 font-semibold shrink-0">Department</dt>
                  <dd className="font-bold text-slate-800 text-right truncate">{departmentLabel}</dd>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <dt className="text-slate-500 font-semibold shrink-0">Portal Role</dt>
                  <dd className="font-bold text-indigo-700 uppercase text-[11px] shrink-0">{formattedRole}</dd>
                </div>
              </dl>
            </div>

            <Link
              to="/portal/directory"
              className="w-full min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <span>Browse Member Directory</span>
              <ChevronRight size={14} />
            </Link>
          </section>

          {/* Member Quick Links & Pastoral Care */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">Fellowship & Next Steps</h2>
              <p className="text-xs text-slate-500 mt-0.5">Quick access to spiritual records, sermons, and surveys.</p>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
              <Link
                to="/portal/profile"
                className="px-3.5 py-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CreditCard size={15} className="text-indigo-600 shrink-0" />
                  <span className="font-bold text-slate-800 truncate">Digital Member ID & Milestones</span>
                </div>
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
              </Link>

              <Link
                to="/portal/resources"
                className="px-3.5 py-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BookOpen size={15} className="text-amber-600 shrink-0" />
                  <span className="font-bold text-slate-800 truncate">Church Resources & Study Guides</span>
                </div>
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
              </Link>

              <Link
                to="/portal/surveys"
                className="px-3.5 py-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ClipboardList size={15} className="text-emerald-600 shrink-0" />
                  <span className="font-bold text-slate-800 truncate">Post-Event Feedback Surveys</span>
                </div>
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

// --- Church Member Directory Page with Admin CRUD, Suspend, Soft Delete & Pic Upload ---

const DirectoryPage = ({ profile }: { profile: Profile | null }) => {
  const [members, setMembers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<ChurchBranch[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [membershipStatusFilter, setMembershipStatusFilter] = useState<string>('all');
  const [portalAccessFilter, setPortalAccessFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Unified Modals State
  const [viewingPerson, setViewingPerson] = useState<Profile | null>(null);
  const [memberModalMode, setMemberModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingPerson, setEditingPerson] = useState<Profile | null>(null);
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Unified 3-Section Form State
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formGender, setFormGender] = useState<'male' | 'female' | 'other'>('other');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAvatar, setFormAvatar] = useState('');
  const [formDob, setFormDob] = useState('');
  const [formMaritalStatus, setFormMaritalStatus] = useState<'Single' | 'Married' | 'Widowed' | 'Divorced'>('Single');
  const [formMarriageDate, setFormMarriageDate] = useState('');

  // Section 2: Church Membership Information
  const [formBranchId, setFormBranchId] = useState('branch-1');
  const [formMembershipStatus, setFormMembershipStatus] = useState<MembershipStatus>('active');
  const [formMembershipDate, setFormMembershipDate] = useState(new Date().toISOString().slice(0, 10));
  const [formAssignedDepartment, setFormAssignedDepartment] = useState('Media & IT Ministry');
  const [formIsBaptized, setFormIsBaptized] = useState(false);
  const [formBaptismDate, setFormBaptismDate] = useState('');
  const [formBaptizedBy, setFormBaptizedBy] = useState('');

  // Section 3: Portal Account (Optional)
  const [formEnablePortal, setFormEnablePortal] = useState(false);
  const [formRole, setFormRole] = useState<AppRole>('member');
  const [formPortalStatus, setFormPortalStatus] = useState<PortalAccountStatus>('active');

  // Portal Invitation / Activation Modal (No plaintext password stored on profile)
  const [portalInviteModal, setPortalInviteModal] = useState<{
    name: string;
    invite: PortalInvitationInfo;
  } | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const isAdminOrPastor = ['super_admin', 'admin', 'pastor', 'district_admin'].includes(profile?.primary_role || '');

  useEffect(() => {
    loadDirectory();
  }, []);

  const loadDirectory = async () => {
    setLoading(true);
    try {
      const [directoryRows, branchRes] = await Promise.all([
        getMembers(),
        supabase.from('church_branches').select('*').order('name', { ascending: true })
      ]);
      setMembers(directoryRows);
      if (branchRes.data) setBranches(branchRes.data as ChurchBranch[]);
    } catch (error) {
      console.error('Unable to load unified member directory:', error);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => setActionFeedback(null), 4500);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const openAddModal = () => {
    setFormError('');
    setEditingPerson(null);
    setFormFirstName('');
    setFormLastName('');
    setFormGender('other');
    setFormEmail('');
    setFormPhone('');
    setFormAvatar('');
    setFormDob('');
    setFormMaritalStatus('Single');
    setFormMarriageDate('');

    setFormBranchId(profile?.branch_id || branches[0]?.id || 'branch-1');
    setFormMembershipStatus('active');
    setFormMembershipDate(new Date().toISOString().slice(0, 10));
    setFormAssignedDepartment('Media & IT Ministry');
    setFormIsBaptized(false);
    setFormBaptismDate('');
    setFormBaptizedBy('Rev. Sarah Johnson');

    setFormEnablePortal(false);
    setFormRole('member');
    setFormPortalStatus('active');
    setMemberModalMode('add');
  };

  const openEditModal = (p: Profile) => {
    setFormError('');
    setEditingPerson(p);
    setFormFirstName(p.first_name || '');
    setFormLastName(p.last_name || '');
    setFormGender(p.gender || 'other');
    setFormEmail(p.email || '');
    setFormPhone(p.phone || '');
    setFormAvatar(p.avatar_url || '');
    setFormDob(p.date_of_birth || '');
    setFormMaritalStatus(p.marital_status || 'Single');
    setFormMarriageDate(p.marriage_date || '');

    setFormBranchId(p.branch_id || 'branch-1');
    setFormMembershipStatus(p.membership_status || 'active');
    setFormMembershipDate(p.membership_date || (p.created_at ? p.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)));
    setFormAssignedDepartment(p.assigned_department || p.department_name || 'Media & IT Ministry');
    setFormIsBaptized(Boolean(p.is_baptized));
    setFormBaptismDate(p.baptism_date || '');
    setFormBaptizedBy(p.baptized_by || 'Rev. Sarah Johnson');

    setFormEnablePortal(hasPortalAccess(p));
    setFormRole(p.primary_role || 'member');
    setFormPortalStatus(p.status || 'active');
    setMemberModalMode('edit');
  };

  const handleUnifiedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    setFormError('');

    try {
      if (memberModalMode === 'add') {
        const result = await registerUnifiedMember({
          first_name: formFirstName,
          last_name: formLastName,
          branch_id: formBranchId,
          membership_date: formMembershipDate,
          membership_status: formMembershipStatus,
          gender: formGender,
          email: formEmail,
          phone: formPhone,
          avatar_url: formAvatar || undefined,
          assigned_department: formAssignedDepartment,
          is_baptized: formIsBaptized,
          baptism_date: formIsBaptized ? formBaptismDate : undefined,
          baptized_by: formIsBaptized ? formBaptizedBy : undefined,
          date_of_birth: formDob || undefined,
          marital_status: formMaritalStatus,
          marriage_date: formMaritalStatus === 'Married' ? formMarriageDate : undefined,
          enable_portal_access: formEnablePortal,
          primary_role: formRole,
          portal_status: formPortalStatus
        });

        setMembers(prev => [result.profile, ...prev]);
        setMemberModalMode(null);
        showToast('success', `${result.profile.first_name} ${result.profile.last_name} added to the Member Directory.`);

        if (result.portalInvite) {
          setPortalInviteModal({
            name: `${result.profile.first_name} ${result.profile.last_name}`,
            invite: result.portalInvite
          });
        }
      } else if (memberModalMode === 'edit' && editingPerson) {
        const result = await updateUnifiedMember(editingPerson.id, {
          first_name: formFirstName,
          last_name: formLastName,
          branch_id: formBranchId,
          gender: formGender,
          email: formEmail,
          phone: formPhone,
          avatar_url: formAvatar || editingPerson.avatar_url,
          membership_status: formMembershipStatus,
          membership_date: formMembershipDate,
          assigned_department: formAssignedDepartment,
          is_baptized: formIsBaptized,
          baptism_date: formIsBaptized ? formBaptismDate : undefined,
          baptized_by: formIsBaptized ? formBaptizedBy : undefined,
          date_of_birth: formDob || undefined,
          marital_status: formMaritalStatus,
          marriage_date: formMaritalStatus === 'Married' ? formMarriageDate : undefined,
          primary_role: formRole,
          portal_status: formPortalStatus,
          enable_portal_access: formEnablePortal
        });

        setMembers(prev => prev.map(p => (p.id === result.profile.id ? result.profile : p)));
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: result.profile }));
        setMemberModalMode(null);
        setEditingPerson(null);
        showToast('success', `Updated ${result.profile.first_name} ${result.profile.last_name}'s directory record.`);

        if (result.portalInvite) {
          setPortalInviteModal({
            name: `${result.profile.first_name} ${result.profile.last_name}`,
            invite: result.portalInvite
          });
        }
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save member record.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleTogglePortalSuspend = async (person: Profile) => {
    const currentStatus = person.status || 'active';
    const nextStatus: PortalAccountStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    try {
      const updated = await updatePortalAccountStatus(person.id, nextStatus);
      setMembers(prev => prev.map(p => (p.id === person.id ? updated : p)));
      showToast(
        'success',
        nextStatus === 'suspended'
          ? `Portal login suspended for ${person.first_name} ${person.last_name} (church membership remains ${person.membership_status || 'active'}).`
          : `Portal login restored for ${person.first_name} ${person.last_name}.`
      );
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Unable to update portal account status.');
    }
  };

  const handleToggleArchiveMembership = async (person: Profile) => {
    const currentMembership = person.membership_status || 'active';
    const nextMembership: MembershipStatus = currentMembership === 'archived' ? 'active' : 'archived';
    try {
      const updated = await updateMembershipStatus(person.id, nextMembership);
      setMembers(prev => prev.map(p => (p.id === person.id ? updated : p)));
      showToast(
        'success',
        nextMembership === 'archived'
          ? `Archived ${person.first_name} ${person.last_name}'s membership record.`
          : `Restored ${person.first_name} ${person.last_name} to active church membership.`
      );
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Unable to update membership status.');
    }
  };

  const handleEnablePortalFromCard = async (person: Profile) => {
    if (!person.email?.trim()) {
      openEditModal(person);
      setFormEnablePortal(true);
      setFormError('Add an email address below to enable portal access for this member.');
      return;
    }
    try {
      const result = await enablePortalAccess(person.id);
      setMembers(prev => prev.map(p => (p.id === person.id ? result.profile : p)));
      if (result.portalInvite) {
        setPortalInviteModal({
          name: `${person.first_name} ${person.last_name}`,
          invite: result.portalInvite
        });
      }
      showToast('success', `Portal access enabled for ${person.first_name} ${person.last_name}.`);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Unable to enable portal access.');
    }
  };

  const handleDisablePortalFromCard = async (person: Profile) => {
    try {
      const updated = await disablePortalAccess(person.id);
      setMembers(prev => prev.map(p => (p.id === person.id ? updated : p)));
      showToast(
        'success',
        `Revoked portal login for ${person.first_name} ${person.last_name}. Church membership record was preserved.`
      );
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Unable to disable portal access.');
    }
  };

  const branchNameById = new Map(branches.map(b => [b.id, b.name]));

  const filtered = members.filter(p => {
    const mStatus = p.membership_status || 'active';
    if (!showArchived && membershipStatusFilter !== 'archived' && mStatus === 'archived') return false;
    if (showArchived && mStatus !== 'archived') return false;
    if (membershipStatusFilter !== 'all' && mStatus !== membershipStatusFilter) return false;

    const portalEnabled = hasPortalAccess(p);
    if (portalAccessFilter === 'enabled' && !portalEnabled) return false;
    if (portalAccessFilter === 'disabled' && portalEnabled) return false;

    const matchesRole = selectedRole === 'all' || p.primary_role === selectedRole;
    const q = search.trim().toLowerCase();
    const nameMatch = !q || `${p.first_name} ${p.last_name} ${p.email || ''} ${p.phone || ''}`.toLowerCase().includes(q);
    return matchesRole && nameMatch;
  });

  const portalCount = members.filter(m => hasPortalAccess(m)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Church Member Directory</h2>
          <p className="text-slate-500 text-sm">
            Unified congregation directory for all members—with or without online portal access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-bold px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
            {filtered.length} Listed · {portalCount} Portal Enabled
          </div>
          {isAdminOrPastor && (
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <UserPlus size={16} /> Add New Member
            </button>
          )}
        </div>
      </div>

      {actionFeedback && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button type="button" onClick={() => setActionFeedback(null)} className="opacity-60 hover:opacity-100 cursor-pointer">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Search & Unified Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search church family by name, email or phone..." 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <select
            aria-label="Filter by membership status"
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none cursor-pointer"
            value={membershipStatusFilter}
            onChange={e => setMembershipStatusFilter(e.target.value)}
          >
            <option value="all">Membership: All</option>
            <option value="active">Active Members</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended Membership</option>
            <option value="transferred">Transferred</option>
            <option value="archived">Archived</option>
          </select>

          <select
            aria-label="Filter by portal access"
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none cursor-pointer"
            value={portalAccessFilter}
            onChange={e => setPortalAccessFilter(e.target.value)}
          >
            <option value="all">Portal Access: All</option>
            <option value="enabled">Portal Enabled</option>
            <option value="disabled">Directory Only (No Login)</option>
          </select>

          <select 
            aria-label="Filter by role"
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none cursor-pointer"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="super_admin">Senior Pastors & Admins</option>
            <option value="pastor">Pastors</option>
            <option value="leader">Ministry Leaders</option>
            <option value="worker">Volunteers & Workers</option>
            <option value="member">Members</option>
          </select>

          {isAdminOrPastor && (
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                showArchived ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {showArchived ? 'Viewing Archived' : 'View Archived'}
            </button>
          )}
        </div>
      </div>

      {/* Unified Member Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-semibold">Loading church directory...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-2">
          <p className="text-sm font-bold text-slate-700">No members match your search or filter criteria.</p>
          <p className="text-xs text-slate-400">Adjust filters or add a new member to the directory.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(person => {
            const portalStatus = person.status || 'active';
            const membershipStatus = person.membership_status || 'active';
            const isPortalSuspended = portalStatus === 'suspended';
            const isMembershipArchived = membershipStatus === 'archived';
            const isBaptized = Boolean(person.is_baptized);
            const bDate = person.baptism_date;
            const portalEnabled = hasPortalAccess(person);

            return (
              <div 
                key={person.id}
                className={`bg-white rounded-3xl border p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden ${
                  isPortalSuspended ? 'border-rose-300 bg-rose-50/20' : isMembershipArchived ? 'border-amber-300 bg-amber-50/20 opacity-80' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border-2 border-indigo-100 flex-shrink-0">
                        <img 
                          src={person.avatar_url || `https://picsum.photos/seed/${person.id}/100/100`} 
                          alt="" 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-base leading-tight">
                          {person.first_name} {person.last_name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {person.primary_role?.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            membershipStatus === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : membershipStatus === 'transferred'
                              ? 'bg-sky-50 text-sky-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {membershipStatus}
                          </span>
                          {portalEnabled && isPortalSuspended && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-700">
                              Portal Suspended
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setViewingPerson(person)}
                      title="View Member Details"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <Eye size={18} />
                    </button>
                  </div>

                  {/* Baptism & Portal Access Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 my-2.5">
                    {isBaptized ? (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-200 flex items-center gap-1">
                        <Sparkles size={11} className="text-amber-600" />
                        Baptized {bDate ? `(${new Date(bDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })})` : ''}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-lg">
                        Unbaptized
                      </span>
                    )}

                    {portalEnabled ? (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-200 flex items-center gap-1">
                        <Key size={11} className="text-emerald-600" />
                        Portal Enabled
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200">
                        No Portal Access
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-slate-500">
                    <p className="flex items-center gap-2 truncate">
                      <span className="text-slate-400 font-semibold w-14">Email:</span>
                      <span className="font-mono text-slate-700 truncate">{person.email || 'Not recorded'}</span>
                    </p>
                    <p className="flex items-center gap-2 truncate">
                      <span className="text-slate-400 font-semibold w-14">Phone:</span>
                      <span className="text-slate-700">{person.phone || 'Not listed'}</span>
                    </p>
                    <p className="flex items-center gap-2 truncate">
                      <span className="text-slate-400 font-semibold w-14">Branch:</span>
                      <span className="text-slate-700 truncate">{branchNameById.get(person.branch_id) || 'Main Campus'}</span>
                    </p>
                  </div>
                </div>

                {/* Member Action Controls */}
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-1.5">
                  {person.email ? (
                    <a 
                      href={`mailto:${person.email}`}
                      className="flex-1 py-2 text-center text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
                    >
                      Send Email
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setViewingPerson(person)}
                      className="flex-1 py-2 text-center text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                    >
                      View Record
                    </button>
                  )}

                  {isAdminOrPastor && (
                    <>
                      <button
                        type="button"
                        onClick={() => (portalEnabled ? handleDisablePortalFromCard(person) : handleEnablePortalFromCard(person))}
                        title={portalEnabled ? 'Disable Portal Access (Keep Membership)' : 'Enable Portal Access'}
                        className={`p-2 rounded-xl transition-colors cursor-pointer ${
                          portalEnabled
                            ? 'bg-emerald-50 hover:bg-amber-50 text-emerald-700 hover:text-amber-700'
                            : 'bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700'
                        }`}
                      >
                        <Key size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(person)}
                        title="Edit Member Record"
                        className="p-2 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl transition-colors cursor-pointer"
                      >
                        <Edit size={16} />
                      </button>

                      {portalEnabled && (
                        <button
                          type="button"
                          onClick={() => handleTogglePortalSuspend(person)}
                          title={isPortalSuspended ? 'Restore Portal Access' : 'Suspend Portal Access'}
                          className={`p-2 rounded-xl transition-colors cursor-pointer ${
                            isPortalSuspended ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600'
                          }`}
                        >
                          <UserMinus size={16} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleArchiveMembership(person)}
                        title={isMembershipArchived ? 'Restore Membership Record' : 'Archive Membership Record'}
                        className={`p-2 rounded-xl transition-colors cursor-pointer ${
                          isMembershipArchived ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-700'
                        }`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- View Member Details Modal --- */}
      {viewingPerson && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-lg">Member Directory Record</h3>
              <button onClick={() => setViewingPerson(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 border-2 border-indigo-200 flex-shrink-0">
                <img src={viewingPerson.avatar_url || `https://picsum.photos/seed/${viewingPerson.id}/200`} alt="" className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-slate-900">{viewingPerson.first_name} {viewingPerson.last_name}</h4>
                <p className="text-xs text-slate-500 font-mono">{viewingPerson.email || 'No email recorded'}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-50 text-indigo-700">
                    {viewingPerson.primary_role?.replace('_', ' ')}
                  </span>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-50 text-emerald-700">
                    {viewingPerson.membership_status || 'active'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-700">
              <div className="flex justify-between"><span className="text-slate-400">Phone:</span> <span className="font-bold">{viewingPerson.phone || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Gender:</span> <span className="font-bold capitalize">{viewingPerson.gender || 'Not specified'}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date of Birth:</span> 
                <span className="font-bold text-purple-700">
                  {viewingPerson.date_of_birth ? new Date(viewingPerson.date_of_birth).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-slate-400">Marital Status:</span> <span className="font-bold">{viewingPerson.marital_status || 'Single'}</span></div>
              {viewingPerson.marital_status === 'Married' && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Marriage Anniversary:</span> 
                  <span className="font-bold text-purple-800">
                    {viewingPerson.marriage_date ? new Date(viewingPerson.marriage_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                  </span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-slate-400">Church Branch:</span> <span className="font-bold">{branchNameById.get(viewingPerson.branch_id) || 'Grace Cathedral'}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-400">Water Baptism:</span> 
                <span className="font-bold text-amber-700">
                  {viewingPerson.is_baptized ? `Baptized (${viewingPerson.baptism_date || 'Date logged'})` : 'Not Baptized'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Portal Access:</span>
                <span className={`font-bold ${hasPortalAccess(viewingPerson) ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {hasPortalAccess(viewingPerson) ? `Enabled (${viewingPerson.status || 'active'})` : 'Directory Only (No Login)'}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-slate-400">Membership Since:</span> <span className="font-bold">{viewingPerson.membership_date || new Date(viewingPerson.created_at).toLocaleDateString()}</span></div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              {isAdminOrPastor && (
                <button
                  type="button"
                  onClick={() => { const target = viewingPerson; setViewingPerson(null); openEditModal(target); }}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Edit Member
                </button>
              )}
              <button onClick={() => setViewingPerson(null)} className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Portal Invitation / Activation Modal (Zero Plaintext Passwords) --- */}
      {portalInviteModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-emerald-200 space-y-5">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Key className="text-emerald-600" size={20} />
                <h3 className="font-extrabold text-slate-900 text-base">Portal Access Provisioned</h3>
              </div>
              <button onClick={() => { setPortalInviteModal(null); setCopiedInvite(false); }} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs space-y-1.5">
              <p className="font-bold text-emerald-900">Portal invitation ready for {portalInviteModal.name}</p>
              <p className="text-emerald-700">
                No password is stored in the directory. Share this activation link so the member can set their own password.
              </p>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Portal Email</span>
                <p className="text-slate-900 font-bold font-mono">{portalInviteModal.invite.email}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Activation Link</span>
                <p className="text-indigo-600 font-mono text-[11px] break-all">{portalInviteModal.invite.setupUrl}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button"
                onClick={() => {
                  const fullUrl = `${window.location.origin}${portalInviteModal.invite.setupUrl}`;
                  navigator.clipboard?.writeText(fullUrl);
                  setCopiedInvite(true);
                  setTimeout(() => setCopiedInvite(false), 2500);
                }}
                className="px-4 py-2.5 bg-emerald-100 text-emerald-800 font-bold rounded-xl text-xs hover:bg-emerald-200 cursor-pointer"
              >
                {copiedInvite ? 'Copied Link!' : 'Copy Activation Link'}
              </button>
              <button 
                type="button" 
                onClick={() => { setPortalInviteModal(null); setCopiedInvite(false); }} 
                className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Unified 3-Section Add / Edit Member Modal --- */}
      {memberModalMode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-start justify-center p-3 sm:p-6 pt-16 sm:pt-20 pb-12 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 max-w-2xl w-full shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {memberModalMode === 'add' ? 'Add New Member' : 'Edit Member Record'}
                </h3>
                <p className="text-xs text-slate-500">
                  One canonical church directory record—portal login access is optional.
                </p>
              </div>
              <button
                type="button"
                disabled={formSaving}
                onClick={() => { setMemberModalMode(null); setEditingPerson(null); }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUnifiedSubmit} className="space-y-5 text-xs">
              {formError && (
                <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-semibold flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Section 1: Personal Information */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px]">
                  1. Personal Information
                </h4>

                <div className="flex items-center gap-3 p-3 bg-white border border-dashed border-slate-300 rounded-xl">
                  {formAvatar ? (
                    <img src={formAvatar} alt="Preview" className="w-12 h-12 rounded-full object-cover border" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                      <Upload size={20} />
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageFileChange} className="text-xs text-slate-500 cursor-pointer" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">First Name *</label>
                    <input type="text" required value={formFirstName} onChange={e => setFormFirstName(e.target.value)} placeholder="e.g. Samuel" className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">Last Name *</label>
                    <input type="text" required value={formLastName} onChange={e => setFormLastName(e.target.value)} placeholder="e.g. Kamara" className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">Gender</label>
                    <select value={formGender} onChange={e => setFormGender(e.target.value as 'male' | 'female' | 'other')} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none font-semibold">
                      <option value="other">Not specified</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">Date of Birth</label>
                    <input type="date" value={formDob} onChange={e => setFormDob(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">Marital Status</label>
                    <select value={formMaritalStatus} onChange={e => setFormMaritalStatus(e.target.value as any)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none font-semibold">
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Widowed">Widowed</option>
                      <option value="Divorced">Divorced</option>
                    </select>
                  </div>
                </div>

                {formMaritalStatus === 'Married' && (
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">Marriage Anniversary Date</label>
                    <input type="date" value={formMarriageDate} onChange={e => setFormMarriageDate(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">Phone Number</label>
                    <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">
                      Email Address {formEnablePortal ? '*' : '(Optional)'}
                    </label>
                    <input
                      type="email"
                      required={formEnablePortal}
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      placeholder={formEnablePortal ? 'member@domain.com' : 'Optional unless enabling portal'}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Church Membership Information */}
              <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-200 space-y-3">
                <h4 className="font-extrabold text-amber-950 uppercase tracking-wider text-[11px]">
                  2. Church Membership Information
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">Branch *</label>
                    <select value={formBranchId} onChange={e => setFormBranchId(e.target.value)} className="w-full p-2.5 bg-white border border-amber-200 rounded-xl outline-none font-semibold">
                      {(branches.length > 0 ? branches : [{ id: 'branch-1', name: 'Grace Cathedral (Main Campus)' } as ChurchBranch]).map(branch => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">Membership Status</label>
                    <select value={formMembershipStatus} onChange={e => setFormMembershipStatus(e.target.value as MembershipStatus)} className="w-full p-2.5 bg-white border border-amber-200 rounded-xl outline-none font-semibold">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                      <option value="transferred">Transferred</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 uppercase block mb-1">Membership Date *</label>
                    <input type="date" required value={formMembershipDate} onChange={e => setFormMembershipDate(e.target.value)} className="w-full p-2.5 bg-white border border-amber-200 rounded-xl outline-none" />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">Assigned Department</label>
                  <select
                    value={formAssignedDepartment}
                    onChange={e => setFormAssignedDepartment(e.target.value)}
                    className="w-full p-2.5 bg-white border border-amber-200 rounded-xl outline-none font-semibold cursor-pointer"
                  >
                    <option value="Media & IT Ministry">Media & IT Ministry</option>
                    <option value="Voices of Grace Choir">Voices of Grace Choir</option>
                    <option value="Kingdom Youth Ministry">Kingdom Youth Ministry</option>
                    <option value="Children Ministry">Children Ministry</option>
                    <option value="Outreach & Evangelism">Outreach & Evangelism</option>
                    <option value="Ushers & Hospitality">Ushers & Hospitality</option>
                    <option value="Intercessory Prayer Team">Intercessory Prayer Team</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-900 pt-1">
                  <input 
                    type="checkbox" 
                    checked={formIsBaptized} 
                    onChange={e => setFormIsBaptized(e.target.checked)} 
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span>Member is Water Baptized</span>
                </label>

                {formIsBaptized && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Baptism Date</label>
                      <input type="date" value={formBaptismDate} onChange={e => setFormBaptismDate(e.target.value)} className="w-full p-2.5 bg-white border border-amber-200 rounded-xl outline-none" />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Officiating Minister</label>
                      <input type="text" value={formBaptizedBy} onChange={e => setFormBaptizedBy(e.target.value)} placeholder="e.g. Rev. Sarah Johnson" className="w-full p-2.5 bg-white border border-amber-200 rounded-xl outline-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Portal Account (Optional) */}
              <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-extrabold text-indigo-950 uppercase tracking-wider text-[11px]">
                      3. Portal Account (Optional)
                    </h4>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      {formEnablePortal
                        ? 'Portal login will be linked via an activation invite (no password stored on profile).'
                        : 'Directory record only—no portal login or auth user will be created.'}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-950 shrink-0">
                    <input 
                      type="checkbox" 
                      checked={formEnablePortal} 
                      onChange={e => setFormEnablePortal(e.target.checked)} 
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span>Enable Portal Access</span>
                  </label>
                </div>

                {formEnablePortal && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="font-bold text-slate-600 uppercase block mb-1">Portal Role</label>
                      <select value={formRole} onChange={e => setFormRole(e.target.value as AppRole)} className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl outline-none font-semibold">
                        <option value="member">Member</option>
                        <option value="worker">Worker</option>
                        <option value="leader">Leader (Dept Lead)</option>
                        <option value="finance_officer">Finance Officer</option>
                        <option value="pastor">Pastor</option>
                        <option value="admin">Admin</option>
                        <option value="district_admin">District Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 uppercase block mb-1">Portal Account Status</label>
                      <select value={formPortalStatus} onChange={e => setFormPortalStatus(e.target.value as PortalAccountStatus)} className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl outline-none font-semibold">
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={formSaving}
                  onClick={() => { setMemberModalMode(null); setEditingPerson(null); }}
                  className="px-4 py-2 font-bold text-slate-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2.5 bg-indigo-600 disabled:opacity-50 text-white font-bold rounded-xl hover:bg-indigo-700 cursor-pointer"
                >
                  {formSaving ? 'Saving…' : memberModalMode === 'add' ? 'Save Member' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Ministries & Teams Congregation Page ---

const MinistriesPage = ({ profile }: { profile: Profile | null }) => {
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<'All' | 'social_fellowship' | 'service_department'>('All');
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);
  const [interestSubmitted, setInterestSubmitted] = useState(false);
  const navigate = useNavigate();

  const isLeader = Boolean(
    profile && (
      ['leader', 'worker', 'super_admin', 'admin', 'pastor', 'district_admin'].includes(profile.primary_role) ||
      Boolean((profile as any)?.assigned_department || (profile as any)?.department_name)
    )
  );
  const isAdmin = profile && ['super_admin', 'admin', 'pastor', 'district_admin'].includes(profile.primary_role);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('ministries').select('*');
      if (data) setMinistries(data as Ministry[]);
    };
    load();
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setInterestSubmitted(true);
    setTimeout(() => {
      setInterestSubmitted(false);
      setSelectedMinistry(null);
    }, 2000);
  };

  // Derive categories from data + default list including Men & Women
  const categoriesInDb: string[] = Array.from(new Set(ministries.map(m => String(m.category || '')))).filter(Boolean) as string[];
  const defaultCategories: string[] = ['Worship', 'Youth', 'Children', 'Men', 'Women', 'Hospitality', 'Prayer', 'Production', 'Outreach'];
  const categoriesList: string[] = Array.from(new Set([...defaultCategories, ...categoriesInDb])) as string[];

  const socialCount = ministries.filter(m => m.type === 'social_fellowship').length;
  const serviceCount = ministries.filter(m => (m.type || 'service_department') === 'service_department').length;

  const filteredMinistries = ministries.filter(m => {
    const matchesCat = selectedCategory === 'All' || m.category.toLowerCase() === selectedCategory.toLowerCase();
    const itemType = m.type || 'service_department';
    const matchesType = selectedType === 'All' || itemType === selectedType;
    return matchesCat && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 flex items-center gap-1">
              <Building2 size={12} /> Grace Cathedral Groups & Departments
            </span>
            <span className="text-xs text-slate-400 font-semibold">• Active Ministries</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Ministries & Service Teams</h2>
          <p className="text-slate-500 text-sm mt-0.5">Explore Social Fellowships (Women's, Youth, Men's) and Service Departments (Media, Choir, Ushers, Prayer).</p>
        </div>

        <div className="flex flex-row items-center gap-2.5 w-full sm:w-auto">
          {/* Category Dropdown Filter placed to the left of action buttons */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 shadow-2xs flex-1 sm:flex-initial min-w-0 sm:min-w-[220px]">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-800 outline-none cursor-pointer w-full pr-1 truncate"
            >
              <option value="All">All Categories ({ministries.length})</option>
              {categoriesList.map((cat: string) => {
                const count = ministries.filter(m => (m.category || '').toLowerCase() === cat.toLowerCase()).length;
                return (
                  <option key={cat} value={cat}>
                    {cat} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {isLeader && (
            <button
              type="button"
              onClick={() => navigate('/portal/leader')}
              className="px-3.5 sm:px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Award size={14} /> Leader Console
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate('/portal/admin?tab=ministries')}
              className="px-3.5 sm:px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer shrink-0"
            >
              + Manage Departments
            </button>
          )}
        </div>
      </div>

      {/* Ministry Type Filter Segmented Tabs */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80">
        <button
          type="button"
          onClick={() => setSelectedType('All')}
          className={`px-2 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 truncate ${
            selectedType === 'All'
              ? 'bg-white text-slate-900 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Building2 size={14} className={`shrink-0 ${selectedType === 'All' ? 'text-indigo-600' : 'text-slate-400'}`} />
          <span className="truncate">All Ministries ({ministries.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedType('social_fellowship')}
          className={`px-2 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 truncate ${
            selectedType === 'social_fellowship'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-100 font-black'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Users size={14} className={`shrink-0 ${selectedType === 'social_fellowship' ? 'text-white' : 'text-amber-600'}`} />
          <span className="truncate">👥 Social Fellowships ({socialCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedType('service_department')}
          className={`px-2 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 truncate ${
            selectedType === 'service_department'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 font-black'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Building2 size={14} className={`shrink-0 ${selectedType === 'service_department' ? 'text-white' : 'text-indigo-600'}`} />
          <span className="truncate">🛠️ Service Departments ({serviceCount})</span>
        </button>
      </div>

      {/* Ministries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMinistries.map((m) => {
          const roles = m.roles_and_responsibilities || [];
          const isSocial = m.type === 'social_fellowship';

          return (
            <div key={m.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Ministry Type Badge */}
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                      isSocial 
                        ? 'bg-amber-100 text-amber-900 border-amber-300' 
                        : 'bg-indigo-100 text-indigo-900 border-indigo-200'
                    }`}>
                      {isSocial ? '👥 Social Fellowship' : '🛠️ Service Department'}
                    </span>
                    {/* Category Tag */}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                      {m.category}
                    </span>
                  </div>

                  <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {m.member_count} Servants
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-2">{m.name}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">{m.description}</p>

                {/* Roles & Positions list */}
                {roles.length > 0 && (
                  <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
                      Serving Opportunities & Roles
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {roles.map((r, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 text-[10px] font-bold rounded-md">
                          • {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Department Leader:</span>
                  <span className="font-bold text-slate-800">{m.leader_name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Gathering Schedule:</span>
                  <span className="font-bold text-indigo-600">{m.meeting_time}</span>
                </div>
                <button 
                  onClick={() => setSelectedMinistry(m)}
                  className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
                >
                  Express Interest & Join Team
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Express Interest Modal */}
      {selectedMinistry && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-black text-[10px] rounded uppercase">
                  {selectedMinistry.category}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">Join {selectedMinistry.name}</h3>
              </div>
              <button onClick={() => setSelectedMinistry(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-full hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            {interestSubmitted ? (
              <div className="p-6 text-center space-y-2">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="font-bold text-slate-900 text-base">Request Received!</h4>
                <p className="text-xs text-slate-500">Department leader <strong className="text-slate-800">{selectedMinistry.leader_name}</strong> has been notified.</p>
              </div>
            ) : (
              <form onSubmit={handleJoin} className="space-y-4 text-xs">
                <p className="text-xs text-slate-600">
                  Let <strong className="text-slate-800">{selectedMinistry.leader_name}</strong> know about your desire to serve in {selectedMinistry.name}.
                </p>

                {(selectedMinistry.roles_and_responsibilities || []).length > 0 && (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase text-indigo-900 tracking-wider block">
                      Available Roles in {selectedMinistry.name}:
                    </span>
                    <ul className="text-[11px] text-indigo-950 font-medium space-y-0.5 list-disc pl-4">
                      {(selectedMinistry.roles_and_responsibilities || []).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">Your Availability</label>
                  <input type="text" required placeholder="e.g. Available Saturdays and Sunday 1st Service" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">Brief Note / Spiritual Gifts</label>
                  <textarea rows={3} placeholder="Tell us about previous experience or desire to serve..." className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button type="button" onClick={() => setSelectedMinistry(null)} className="px-4 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl cursor-pointer">Cancel</button>
                  <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-extrabold hover:bg-indigo-700 shadow-md shadow-indigo-100 cursor-pointer">Submit Interest</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Leader & Worker Department Console ---

const LeaderConsolePage = ({ profile }: { profile: Profile | null }) => {
  const isLeaderOrStaff = Boolean(
    profile && (
      ['super_admin', 'admin', 'pastor', 'district_admin', 'leader', 'worker'].includes(profile.primary_role) ||
      Boolean((profile as any)?.assigned_department || (profile as any)?.department_name)
    )
  );
  const navigate = useNavigate();

  // Only Admins and Pastors have permission to switch between all department consoles
  const canSwitchDepts = Boolean(profile && ['super_admin', 'admin', 'pastor', 'district_admin'].includes(profile.primary_role));
  
  // User's specifically assigned department
  const userAssignedDept = (profile as any)?.assigned_department || (profile as any)?.department_name || 'Media & IT Ministry';

  const [activeDept, setActiveDept] = useState(canSwitchDepts ? 'Media & IT Ministry' : userAssignedDept);
  const [leaderConsoleSubTab, setLeaderConsoleSubTab] = useState<'finance' | 'roster' | 'welfare'>('finance');
  const [financeSectionFilter, setFinanceSectionFilter] = useState<'all' | 'proposals' | 'ledger'>('all');

  // Member Welfare & Contributions Module State
  const [memberContributions, setMemberContributions] = useState<MemberContribution[]>(() => getMemberContributions(activeDept));
  const [welfareCampaigns, setWelfareCampaigns] = useState<WelfareCampaignDrive[]>(() => getWelfareCampaigns(activeDept));
  const [activeWelfareTab, setActiveWelfareTab] = useState<'drives' | 'monthly_dues' | 'cards' | 'ledger'>('drives');
  const [selectedCampaignDriveId, setSelectedCampaignDriveId] = useState<string>('');
  const [welfareFilterCategory, setWelfareFilterCategory] = useState<string>('all');
  const [welfareSearchQuery, setWelfareSearchQuery] = useState<string>('');

  // Launch Dedicated Welfare Campaign Drive Modal State
  const [showLaunchCampaignModal, setShowLaunchCampaignModal] = useState(false);
  const [campBeneficiaryId, setCampBeneficiaryId] = useState('');
  const [campBeneficiaryName, setCampBeneficiaryName] = useState('');
  const [campReason, setCampReason] = useState<WelfareReason>('marriage');
  const [campTitle, setCampTitle] = useState('');
  const [campDesc, setCampDesc] = useState('');
  const [campExpectedPerMember, setCampExpectedPerMember] = useState<string | number>(200);
  const [campTargetTotal, setCampTargetTotal] = useState<string | number>(2000);
  const [campDeadline, setCampDeadline] = useState('2026-11-28');

  // Record Member Contribution Modal State
  const [showRecordContribModal, setShowRecordContribModal] = useState(false);
  const [contribCampaignId, setContribCampaignId] = useState('');
  const [contribMemberId, setContribMemberId] = useState('');
  const [contribMemberName, setContribMemberName] = useState('');
  const [contribCategory, setContribCategory] = useState<ContributionCategory>('welfare');
  const [contribWelfareReason, setContribWelfareReason] = useState<WelfareReason>('marriage');
  const [contribSpecialPurpose, setContribSpecialPurpose] = useState('');
  const [contribMonthYear, setContribMonthYear] = useState('2026-11');
  const [contribAmount, setContribAmount] = useState<string | number>('');
  const [contribPaymentMethod, setContribPaymentMethod] = useState<'cash' | 'mobile_money' | 'bank_transfer'>('mobile_money');
  const [contribRef, setContribRef] = useState('');
  const [contribNotes, setContribNotes] = useState('');

  // Member Welfare Passbook Card Modal State
  const [showWelfareCardModal, setShowWelfareCardModal] = useState(false);
  const [selectedWelfareCard, setSelectedWelfareCard] = useState<MemberWelfareCard | null>(null);

  // In-App Reminders & Notifications Modal State
  const [deptNotifications, setDeptNotifications] = useState<InAppNotification[]>(() => getDepartmentNotifications(activeDept));
  const [showInAppNotifModal, setShowInAppNotifModal] = useState(false);

  // Member Tasks Widget State
  const [memberTaskFilter, setMemberTaskFilter] = useState<'all' | 'pending_contrib' | 'duty' | 'profile'>('all');
  const [dismissedTaskIds, setDismissedTaskIds] = useState<string[]>([]);

  useEffect(() => {
    setMemberContributions(getMemberContributions(activeDept));
    setWelfareCampaigns(getWelfareCampaigns(activeDept));
    setDeptNotifications(getDepartmentNotifications(activeDept));

    const handleWelfareUpd = (e: any) => {
      if (!e.detail || e.detail.department === activeDept) {
        setMemberContributions(getMemberContributions(activeDept));
        setWelfareCampaigns(getWelfareCampaigns(activeDept));
        setDeptNotifications(getDepartmentNotifications(activeDept));
      }
    };
    const handleNotifUpd = () => {
      setDeptNotifications(getDepartmentNotifications(activeDept));
    };
    window.addEventListener('dept_welfare_updated', handleWelfareUpd);
    window.addEventListener('dept_welfare_campaigns_updated', handleWelfareUpd);
    window.addEventListener('dept_notification_sent', handleNotifUpd);
    return () => {
      window.removeEventListener('dept_welfare_updated', handleWelfareUpd);
      window.removeEventListener('dept_welfare_campaigns_updated', handleWelfareUpd);
      window.removeEventListener('dept_notification_sent', handleNotifUpd);
    };
  }, [activeDept]);

  const handleSaveWelfareCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campBeneficiaryName.trim() || !campTitle.trim() || !campExpectedPerMember) return;

    const newCamp: WelfareCampaignDrive = {
      id: `camp-${Date.now()}`,
      department_name: activeDept,
      beneficiary_member_id: campBeneficiaryId || undefined,
      beneficiary_member_name: campBeneficiaryName.trim(),
      reason: campReason,
      title: campTitle.trim(),
      description: campDesc.trim() || undefined,
      expected_amount_per_member: Number(campExpectedPerMember),
      target_total_amount: Number(campTargetTotal) || (Number(campExpectedPerMember) * Math.max(1, deptRoster.length)),
      deadline: campDeadline || '2026-11-28',
      status: 'active',
      created_at: new Date().toISOString(),
      created_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader'
    };

    saveWelfareCampaign(newCamp);
    setWelfareCampaigns(getWelfareCampaigns(activeDept));
    setShowLaunchCampaignModal(false);
    setProposalSuccessToast(`Launched Dedicated Welfare Support Drive: "${newCamp.title}"`);
    setTimeout(() => setProposalSuccessToast(null), 4000);
  };

  const handleSaveMemberContribution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contribMemberName.trim() || !contribAmount || Number(contribAmount) <= 0) return;

    const mId = contribMemberId || `m_${Date.now()}`;
    const cardNumber = generateWelfareCardNumber(activeDept, mId);

    const newContrib: MemberContribution = {
      id: `contrib-${Date.now()}`,
      department_name: activeDept,
      campaign_id: contribCampaignId || undefined,
      member_id: mId,
      member_name: contribMemberName.trim(),
      welfare_card_number: cardNumber,
      category: contribCategory,
      welfare_reason: contribCategory === 'welfare' ? contribWelfareReason : undefined,
      special_support_purpose: contribCategory === 'special_support' ? (contribSpecialPurpose.trim() || 'Special Support Task') : undefined,
      period_month_year: contribCategory === 'monthly_dues' ? (contribMonthYear || '2026-11') : undefined,
      amount: Number(contribAmount),
      currency: 'SLE',
      date: new Date().toISOString(),
      payment_method: contribPaymentMethod as any,
      transaction_ref: contribRef.trim() || undefined,
      recorded_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Secretary',
      notes: contribNotes.trim() || undefined
    };

    saveMemberContribution(newContrib);
    setMemberContributions(getMemberContributions(activeDept));
    setDeptLedgerRecords(getDepartmentLedgerRecords(activeDept));
    setShowRecordContribModal(false);
    setProposalSuccessToast(`Recorded SLE ${newContrib.amount.toLocaleString()} contribution for ${contribMemberName.trim()}!`);
    setTimeout(() => setProposalSuccessToast(null), 4000);
  };

  const openRecordContribForMember = (member: any) => {
    setContribMemberId(member.id);
    setContribMemberName(member.name);
    setContribCategory('welfare');
    setContribWelfareReason('marriage');
    setContribSpecialPurpose('');
    setContribMonthYear('2026-11');
    setContribAmount('');
    setContribPaymentMethod('mobile_money');
    setContribRef('');
    setContribNotes('');
    setShowRecordContribModal(true);
  };

  const openViewWelfareCard = (member: any) => {
    const card = getMemberWelfareCard(member.id, member.name, activeDept);
    setSelectedWelfareCard(card);
    setShowWelfareCardModal(true);
  };

  const handlePrintWelfareCard = () => {
    if (!selectedWelfareCard) return;
    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Welfare Card - ${selectedWelfareCard.member_name}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 30px; color: #0f172a; background: #f8fafc; }
            .card { border: 3px solid #6b21a8; border-radius: 20px; padding: 25px; max-width: 500px; margin: 0 auto; background: linear-gradient(135deg, #faf5ff 0%, #ffffff 100%); box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 2px solid #e9d5ff; padding-bottom: 15px; margin-bottom: 15px; }
            .church-name { font-size: 18px; font-weight: 900; color: #581c87; text-transform: uppercase; letter-spacing: 1px; }
            .dept-name { font-size: 13px; font-weight: 700; color: #7e22ce; margin-top: 4px; }
            .card-num { font-family: monospace; font-size: 13px; font-weight: 900; background: #f3e8ff; color: #6b21a8; padding: 4px 12px; border-radius: 8px; display: inline-block; margin-top: 8px; }
            .member-info { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
            .avatar { width: 50px; height: 50px; border-radius: 50%; background: #6b21a8; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center; margin-bottom: 20px; }
            .box { background: #ffffff; border: 1px solid #e2e8f0; padding: 10px; border-radius: 12px; }
            .box-label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; }
            .box-val { font-size: 14px; font-weight: 900; font-family: monospace; color: #581c87; margin-top: 4px; }
            .footer { font-size: 11px; text-align: center; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <div class="church-name">FaithConnect • Grace Cathedral</div>
              <div class="dept-name">${selectedWelfareCard.department_name} Passbook</div>
              <div class="card-num">${selectedWelfareCard.card_number}</div>
            </div>
            <div class="member-info">
              <div class="avatar">${selectedWelfareCard.member_name[0]}</div>
              <div>
                <h2 style="margin:0; font-size:18px;">${selectedWelfareCard.member_name}</h2>
                <span style="font-size:11px; color:#16a34a; font-weight:bold; text-transform:uppercase;">Status: ${selectedWelfareCard.status}</span>
              </div>
            </div>
            <div class="grid">
              <div class="box"><div class="box-label">Welfare</div><div class="box-val">SLE ${selectedWelfareCard.total_welfare_paid.toLocaleString()}</div></div>
              <div class="box"><div class="box-label">Monthly Dues</div><div class="box-val">SLE ${selectedWelfareCard.total_dues_paid.toLocaleString()}</div></div>
              <div class="box"><div class="box-label">Support</div><div class="box-val">SLE ${selectedWelfareCard.total_support_paid.toLocaleString()}</div></div>
            </div>
            <div class="footer">
              Official Ministry Treasury Member Welfare Passbook Card • Issued: ${selectedWelfareCard.issued_date}
            </div>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;
    printWin.document.write(html);
    printWin.document.close();
  };

  // Enforce department console isolation for assigned Department Leaders
  useEffect(() => {
    if (!canSwitchDepts && activeDept !== userAssignedDept) {
      setActiveDept(userAssignedDept);
    }
  }, [profile, canSwitchDepts, userAssignedDept, activeDept]);

  // Department Local Income & Expense Ledger State
  const [deptLedgerRecords, setDeptLedgerRecords] = useState<DepartmentLedgerRecord[]>([]);
  const [showDeptRecordModal, setShowDeptRecordModal] = useState(false);
  const [deptRecordType, setDeptRecordType] = useState<'income' | 'expense'>('expense');
  const [deptRecordCategory, setDeptRecordCategory] = useState('Equipment Maintenance & Supplies');
  const [deptRecordDesc, setDeptRecordDesc] = useState('');
  const [deptRecordAmount, setDeptRecordAmount] = useState('');
  const [deptRecordVendor, setDeptRecordVendor] = useState('');
  const [deptRecordMethod, setDeptRecordMethod] = useState<'cash' | 'mobile_money' | 'bank_transfer'>('cash');
  const [deptRecordNotes, setDeptRecordNotes] = useState('');

  // Document Scanner Modal State
  const [showDocumentScanner, setShowDocumentScanner] = useState(false);
  const [scannedReceiptUrl, setScannedReceiptUrl] = useState<string | null>(null);
  const [inspectingReceiptUrl, setInspectingReceiptUrl] = useState<string | null>(null);
  const [scannerContext, setScannerContext] = useState<'reconciliation' | 'ledger'>('reconciliation');

  // Report Generator Modal State (Income & Expense Module)
  const [showReportGeneratorModal, setShowReportGeneratorModal] = useState(false);
  const [reportFilterType, setReportFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [reportDateRange, setReportDateRange] = useState<'all' | 'this_month' | 'this_quarter' | 'this_year'>('all');

  useEffect(() => {
    setDeptLedgerRecords(getDepartmentLedgerRecords(activeDept));
    const handleDeptUpd = (e: any) => {
      if (!e.detail || e.detail.department === activeDept) {
        setDeptLedgerRecords(getDepartmentLedgerRecords(activeDept));
      }
    };
    window.addEventListener('dept_ledger_updated', handleDeptUpd);
    return () => window.removeEventListener('dept_ledger_updated', handleDeptUpd);
  }, [activeDept]);
  
  const [requisitions, setRequisitions] = useState<DepartmentRequisition[]>([]);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalSuccessToast, setProposalSuccessToast] = useState<string | null>(null);

  // Proposal & Proforma Invoice Preview / Edit Modal State
  const [showProposalPreviewModal, setShowProposalPreviewModal] = useState(false);
  const [previewProposal, setPreviewProposal] = useState<DepartmentRequisition | null>(null);
  const [previewTab, setPreviewTab] = useState<'invoice' | 'edit'>('invoice');

  const handleSaveAndSubmitEditedProposal = (updatedReq: DepartmentRequisition) => {
    const totalAmount = updatedReq.items.reduce((sum, item) => sum + (Number(item.quantity || 1) * Number(item.unit_price || 0)), 0);
    const finalReq: DepartmentRequisition = {
      ...updatedReq,
      requested_amount: totalAmount > 0 ? totalAmount : updatedReq.requested_amount,
      items: updatedReq.items.map((item, idx) => ({
        ...item,
        total_price: Number(item.quantity || 1) * Number(item.unit_price || 0)
      }))
    };

    const exists = requisitions.some(r => r.id === finalReq.id);
    let updatedList: DepartmentRequisition[];
    if (exists) {
      updatedList = requisitions.map(r => r.id === finalReq.id ? finalReq : r);
    } else {
      updatedList = [finalReq, ...requisitions];
    }

    saveRequisitions(updatedList);
    setRequisitions(updatedList);
    setShowProposalPreviewModal(false);
    setShowProposalModal(false);
    setPreviewProposal(null);

    setProposalSuccessToast(`Proposal & Proforma Invoice ${finalReq.requisition_number} saved & submitted for Senior Pastor & Board Approval!`);
    setTimeout(() => setProposalSuccessToast(null), 6000);
  };

  const handlePrintProformaInvoicePDF = (req: DepartmentRequisition) => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = getChurchProfile();
    const totalAmount = req.items.reduce((s, i) => s + (i.total_price || (i.quantity * i.unit_price)), 0);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${cp.name} - Official Proforma Invoice & Proposal ${req.requisition_number}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #0f172a; }
            .header { border-bottom: 3px solid #4338ca; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-start; }
            .logo { font-size: 24px; font-weight: 900; color: #4338ca; }
            .sub { font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px; }
            .badge { display: inline-block; padding: 4px 10px; background: #e0e7ff; color: #3730a3; font-size: 10px; font-weight: 800; border-radius: 6px; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 12px; font-size: 12px; border: 1px solid #e2e8f0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 10px; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; font-weight: 800; }
            td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
            .total-box { text-align: right; font-size: 18px; font-weight: 900; color: #4338ca; padding: 15px; background: #e0e7ff; border-radius: 12px; margin-bottom: 30px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 50px; border-top: 2px dashed #cbd5e1; padding-top: 20px; font-size: 11px; }
            .sig-line { border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">${cp.name.toUpperCase()}</div>
              <div class="sub">${req.department_name} • Internal Procurement Proposal & Proforma Invoice</div>
              <div style="margin-top: 6px;"><span class="badge">Status: ${req.status.replace(/_/g, ' ').toUpperCase()} | Priority: ${req.priority.toUpperCase()}</span></div>
            </div>
            <div style="text-align: right;">
              <div class="sub">Invoice Ref: ${req.requisition_number}</div>
              <div class="sub">Date: ${new Date(req.created_at).toLocaleDateString()}</div>
              <div class="sub">Needed By: ${req.needed_by_date || 'Urgent'}</div>
            </div>
          </div>

          <h2 style="font-size: 16px; margin-bottom: 4px; font-weight: 900;">${req.title.toUpperCase()}</h2>
          <p style="font-size: 11px; color: #64748b; margin-top: 0; margin-bottom: 20px;">${req.description}</p>

          <div class="grid">
            <div>
              <strong style="color: #475569; font-size: 10px; text-transform: uppercase;">Applicant Leader:</strong><br/>
              <span style="font-weight: 800; color: #0f172a;">${req.applicant_name} (${req.applicant_role || 'Ministry Lead'})</span>
            </div>
            <div>
              <strong style="color: #475569; font-size: 10px; text-transform: uppercase;">Disbursement Channel:</strong><br/>
              <span style="font-weight: 800; color: #0f172a;">${req.disbursement_method?.replace('_', ' ').toUpperCase()} • ${req.disbursement_account_info || 'Church Treasury Standard'}</span>
            </div>
          </div>

          <h3 style="font-size: 13px; margin-bottom: 10px; font-weight: 800;">Itemized Quotation Breakdown</h3>
          <table>
            <thead>
              <tr>
                <th>Item Name & Specifications</th>
                <th style="text-align: center;">Quantity</th>
                <th style="text-align: right;">Unit Price (SLE)</th>
                <th style="text-align: right;">Line Total (SLE)</th>
              </tr>
            </thead>
            <tbody>
              ${req.items.map(i => `
                <tr>
                  <td><strong>${i.item_name}</strong></td>
                  <td style="text-align: center;">${i.quantity}</td>
                  <td style="text-align: right; font-family: monospace;">${i.unit_price.toLocaleString()}</td>
                  <td style="text-align: right; font-weight: 900; font-family: monospace; color: #4338ca;">
                    ${(i.quantity * i.unit_price).toLocaleString()}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="total-box">
            TOTAL INVOICE AMOUNT: SLE ${totalAmount.toLocaleString()}
          </div>

          <div class="signatures">
            <div>
              <div class="sig-line"></div>
              <strong>Submitted By</strong><br/>
              ${req.applicant_name}
            </div>
            <div>
              <div class="sig-line"></div>
              <strong>Senior Pastor Authorization</strong><br/>
              Rev. Sarah Johnson
            </div>
            <div>
              <div class="sig-line"></div>
              <strong>Financial Officer Audit</strong><br/>
              Sahr Sesay (Financial Controller)
            </div>
          </div>

          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printWin.document.write(html);
    printWin.document.close();
  };

  // Expenditure & Receipt Upload Modal State
  const [reconcileReq, setReconcileReq] = useState<DepartmentRequisition | null>(null);
  const [actualSpentInput, setActualSpentInput] = useState<string>('');
  const [receiptProofInput, setReceiptProofInput] = useState<string>('');
  const [receiptNotesInput, setReceiptNotesInput] = useState<string>('');

  const openReconcileModal = (req: DepartmentRequisition) => {
    setReconcileReq(req);
    setActualSpentInput(String(req.requested_amount));
    setReceiptProofInput(req.vendor_quote_url || 'Vendor_Tax_Receipt_Signed.pdf');
    setReceiptNotesInput(`Purchased ${req.title}. All items received and verified.`);
    setScannedReceiptUrl(null);
  };

  const handleConfirmReconciliation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileReq) return;
    const spent = Number(actualSpentInput) || 0;
    const unspent = Math.max(0, reconcileReq.requested_amount - spent);

    const updated = requisitions.map(r => r.id === reconcileReq.id ? {
      ...r,
      status: 'reconciled' as const,
      actual_amount_spent: spent,
      unspent_balance_returned: unspent,
      receipt_proof_url: scannedReceiptUrl || receiptProofInput.trim() || 'Vendor_Tax_Receipt_Signed.pdf',
      receipt_notes: receiptNotesInput.trim(),
      reconciled_at: new Date().toISOString(),
      reconciled_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Lead'
    } : r);

    setRequisitions(updated);
    saveRequisitions(updated);
    setReconcileReq(null);
    setScannedReceiptUrl(null);
    setProposalSuccessToast(`Receipt & Expenditure Report submitted for ${reconcileReq.requisition_number}! The Finance Officer has been notified to audit & settle in Good Standing.`);
    setTimeout(() => setProposalSuccessToast(null), 6000);
  };

  const handleSaveDeptRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptRecordAmount || Number(deptRecordAmount) <= 0) return;

    const newRecord: DepartmentLedgerRecord = {
      id: `drec-${Date.now()}`,
      department_name: activeDept,
      type: deptRecordType,
      category: deptRecordCategory,
      description: deptRecordDesc.trim() || `${deptRecordType.toUpperCase()} Entry`,
      amount: Number(deptRecordAmount),
      currency: 'SLE',
      date: new Date().toISOString(),
      recorded_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Lead',
      vendor_name: deptRecordVendor.trim() || undefined,
      payment_method: deptRecordMethod,
      notes: deptRecordNotes.trim() || undefined,
      receipt_image_url: scannedReceiptUrl || undefined
    };

    saveDepartmentLedgerRecord(newRecord);
    setDeptLedgerRecords(getDepartmentLedgerRecords(activeDept));
    setShowDeptRecordModal(false);
    setDeptRecordDesc('');
    setDeptRecordAmount('');
    setDeptRecordVendor('');
    setDeptRecordNotes('');
    setScannedReceiptUrl(null);
    setProposalSuccessToast(`Department ${deptRecordType} entry of SLE ${Number(deptRecordAmount).toLocaleString()} recorded successfully!`);
    setTimeout(() => setProposalSuccessToast(null), 5000);
  };

  const handleGenerateDeptFinancialPDFReport = (
    deptName: string, 
    filterType: 'all' | 'income' | 'expense' = 'all', 
    dateRange: string = 'all'
  ) => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = getChurchProfile();
    const summary = getDepartmentLedgerSummary(deptName);

    // Filter records based on selected filterType and dateRange
    let filteredRecords = summary.records;
    if (filterType === 'income') {
      filteredRecords = filteredRecords.filter(r => r.type === 'income');
    } else if (filterType === 'expense') {
      filteredRecords = filteredRecords.filter(r => r.type === 'expense');
    }

    const now = new Date();
    if (dateRange === 'this_month') {
      filteredRecords = filteredRecords.filter(r => {
        const d = new Date(r.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (dateRange === 'this_quarter') {
      const q = Math.floor(now.getMonth() / 3);
      filteredRecords = filteredRecords.filter(r => {
        const d = new Date(r.date);
        return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === now.getFullYear();
      });
    } else if (dateRange === 'this_year') {
      filteredRecords = filteredRecords.filter(r => new Date(r.date).getFullYear() === now.getFullYear());
    }

    const totalInc = filteredRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const totalExp = filteredRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const netBal = totalInc - totalExp;

    const reportTitle = filterType === 'income' 
      ? 'DEPARTMENT INCOME & REVENUE STATEMENT' 
      : filterType === 'expense' 
      ? 'DEPARTMENT EXPENDITURE & EXPENSE REPORT' 
      : 'DEPARTMENT FINANCIAL OPERATIONS STATEMENT';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${cp.name} - ${deptName} ${reportTitle}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #0f172a; }
            .header { border-bottom: 3px solid #1e1b4b; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-start; }
            .logo { font-size: 22px; font-weight: 900; color: #1e1b4b; letter-spacing: -0.5px; }
            .sub { font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px; }
            .badge { display: inline-block; padding: 4px 10px; background: #e0e7ff; color: #3730a3; font-size: 10px; font-weight: 800; border-radius: 6px; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 12px; font-size: 12px; border: 1px solid #e2e8f0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 10px; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; font-weight: 800; }
            td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 50px; border-top: 2px dashed #cbd5e1; padding-top: 20px; font-size: 11px; }
            .sig-line { border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">${cp.name.toUpperCase()}</div>
              <div class="sub">${deptName} • Income & Expense Module Report</div>
              <div style="margin-top: 6px;"><span class="badge">Scope: ${filterType.toUpperCase()} | Period: ${dateRange.replace('_', ' ').toUpperCase()}</span></div>
            </div>
            <div style="text-align: right;">
              <div class="sub">Generated: ${new Date().toLocaleString()}</div>
              <div class="sub">Doc Ref: RPT-${Date.now().toString().slice(-6)}</div>
              <div class="sub">Currency: SLE</div>
            </div>
          </div>

          <h2 style="font-size: 16px; margin-bottom: 4px; font-weight: 900; color: #0f172a;">${reportTitle}</h2>
          <p style="font-size: 11px; color: #64748b; margin-top: 0; margin-bottom: 20px;">Official financial audit statement generated exclusively from the Department Income & Expense Ledger.</p>

          <div class="grid">
            <div>
              <strong style="color: #475569; font-size: 10px; text-transform: uppercase;">Total Income:</strong><br/>
              <span style="font-size: 16px; font-weight: 900; color: #059669;">SLE ${totalInc.toLocaleString()}</span>
            </div>
            <div>
              <strong style="color: #475569; font-size: 10px; text-transform: uppercase;">Total Expenses:</strong><br/>
              <span style="font-size: 16px; font-weight: 900; color: #e11d48;">SLE ${totalExp.toLocaleString()}</span>
            </div>
            <div>
              <strong style="color: #475569; font-size: 10px; text-transform: uppercase;">Net Operating Position:</strong><br/>
              <span style="font-size: 16px; font-weight: 900; color: ${netBal >= 0 ? '#4338ca' : '#e11d48'};">SLE ${netBal.toLocaleString()}</span>
            </div>
          </div>

          <h3 style="font-size: 13px; margin-bottom: 10px; font-weight: 800;">Itemized Income & Expense Ledger (${filteredRecords.length} Entries)</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category & Description</th>
                <th>Vendor / Payer</th>
                <th>Payment Method</th>
                <th style="text-align: right;">Amount (SLE)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRecords.length === 0 ? `
                <tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px;">No transactions recorded for this selected scope and period.</td></tr>
              ` : filteredRecords.map(r => `
                <tr>
                  <td>${new Date(r.date).toLocaleDateString()}</td>
                  <td style="font-weight: 800; text-transform: uppercase; color: ${r.type === 'expense' ? '#e11d48' : '#059669'};">${r.type}</td>
                  <td><strong>${r.category}</strong><br/><span style="color: #64748b; font-size: 11px;">${r.description}</span></td>
                  <td>${r.vendor_name || 'Department Internal'}</td>
                  <td style="font-family: monospace; text-transform: uppercase; font-size: 10px; color: #64748b;">${r.payment_method ? r.payment_method.replace('_', ' ') : 'CASH'}</td>
                  <td style="text-align: right; font-weight: 900; color: ${r.type === 'expense' ? '#e11d48' : '#059669'}">
                    ${r.type === 'expense' ? '-' : '+'}${r.amount.toLocaleString()}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="signatures">
            <div>
              <div class="sig-line"></div>
              <strong>Department Leader Sign-off</strong><br/>
              ${profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader'}
            </div>
            <div>
              <div class="sig-line"></div>
              <strong>Finance Officer Verification</strong><br/>
              Sahr Sesay (Financial Controller)
            </div>
            <div>
              <div class="sig-line"></div>
              <strong>Senior Pastor Sign-off</strong><br/>
              Rev. Sarah Johnson
            </div>
          </div>

          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printWin.document.write(html);
    printWin.document.close();
  };

  // Proposal Form State
  const [reqDept, setReqDept] = useState('Media & IT Ministry');
  const [reqApplicantName, setReqApplicantName] = useState(profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader');
  const [reqApplicantRole, setReqApplicantRole] = useState('Department Head');
  const [reqTitle, setReqTitle] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [reqPriority, setReqPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('high');
  const [reqNeededDate, setReqNeededDate] = useState('');
  const [reqVendorQuote, setReqVendorQuote] = useState('');
  const [reqDisbMethod, setReqDisbMethod] = useState<'bank_transfer' | 'mobile_money' | 'cash'>('bank_transfer');
  const [reqDisbInfo, setReqDisbInfo] = useState('');
  const [reqItems, setReqItems] = useState<{ item_name: string; quantity: number; unit_price: number }[]>([
    { item_name: 'Apple MacBook Pro M3 Max (Editing Station)', quantity: 2, unit_price: 12500 },
    { item_name: 'Sony FX3 4K Cinema Camera System', quantity: 1, unit_price: 8000 },
    { item_name: 'Heavy-Duty Fluid Head Tripod & SDI Cables', quantity: 2, unit_price: 1000 }
  ]);

  const [volunteers, setVolunteers] = useState<any[]>([
    { id: 'v-1', name: 'Jonathan Davis', email: 'jdavis@gmail.com', phone: '+1 555-901-2345', status: 'pending', note: 'Sings tenor in college choir, eager to join worship team' },
    { id: 'v-2', name: 'Maria Santos', email: 'msantos@gmail.com', phone: '+1 555-890-1234', status: 'pending', note: 'Interested in Sunday media slide operation' }
  ]);
  const [notices, setNotices] = useState<any[]>([
    { id: 'n-1', dept: 'Media & IT Ministry', author: 'David Koroma', text: 'Multi-camera broadcast rehearsal for Easter Sunday streaming session on Friday 5 PM.', date: new Date().toISOString() },
    { id: 'n-2', dept: 'Voices of Grace Choir', author: 'Hannah Adams', text: 'Robes for Sunday 1st Service will be Royal Blue.', date: new Date(Date.now() - 86400000).toISOString() }
  ]);
  const [newNoticeText, setNewNoticeText] = useState('');

  // Department Roster State & localStorage Persistence
  const getInitialDeptRoster = (deptName: string) => {
    const saved = localStorage.getItem(`fc_roster_${deptName}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parsing roster:', e);
      }
    }

    if (deptName.includes('Media')) {
      return [
        { id: 'r-1', name: 'David Koroma', role: 'Media Team Lead', status: 'Active', duty: 'Sanctuary Main Stream Switcher', email: 'dkoroma@gracecathedral.org', phone: '+232 76 123456', joined_date: '2023-04-12' },
        { id: 'r-2', name: 'Samuel Cole', role: 'Audio Engineer Lead', status: 'Active', duty: 'FOH Sound Desk & Wireless Mics', email: 'scole@gracecathedral.org', phone: '+232 77 987654', joined_date: '2023-08-15' },
        { id: 'r-3', name: 'Emmanuel Peters', role: 'Graphics & Slide Operator', status: 'Active', duty: 'Sanctuary Projection & Livestream Overlays', email: 'epeters@gmail.com', phone: '+232 78 456789', joined_date: '2024-01-10' }
      ];
    } else if (deptName.includes('Choir') || deptName.includes('Voices')) {
      return [
        { id: 'r-1', name: 'Hannah Adams', role: 'Worship Director', status: 'Active', duty: 'Sunday 1st Service Lead', email: 'hadams@gracecathedral.org', phone: '+232 76 555123', joined_date: '2022-11-01' },
        { id: 'r-2', name: 'Grace Campbell', role: 'Soprano Lead', status: 'Active', duty: 'Sunday 2nd Service Choir', email: 'gcampbell@gmail.com', phone: '+232 77 111222', joined_date: '2023-02-14' },
        { id: 'r-3', name: 'Michael Turay', role: 'Main Keyboardist', status: 'Active', duty: 'Choir Rehearsal & Service Band', email: 'mturay@gmail.com', phone: '+232 78 999888', joined_date: '2023-06-20' }
      ];
    } else {
      return [
        { id: 'r-1', name: 'David Koroma', role: `${deptName} Lead`, status: 'Active', duty: 'Ministry Operations & Logistics', email: 'dkoroma@gracecathedral.org', phone: '+232 76 123456', joined_date: '2023-01-15' },
        { id: 'r-2', name: 'Sarah Bangura', role: 'Assistant Coordinator', status: 'Active', duty: 'Sunday Roster Scheduling', email: 'sbangura@gmail.com', phone: '+232 77 222333', joined_date: '2023-05-10' }
      ];
    }
  };

  const [deptRoster, setDeptRoster] = useState<any[]>(() => getInitialDeptRoster(activeDept));

  useEffect(() => {
    setDeptRoster(getInitialDeptRoster(activeDept));
  }, [activeDept]);

  const updateDeptRoster = (newRoster: any[]) => {
    setDeptRoster(newRoster);
    localStorage.setItem(`fc_roster_${activeDept}`, JSON.stringify(newRoster));
  };

  // View Member Modal state
  const [viewingRosterMember, setViewingRosterMember] = useState<any | null>(null);

  // Edit Member Modal state
  const [editingRosterMember, setEditingRosterMember] = useState<any | null>(null);
  const [editRosterName, setEditRosterName] = useState('');
  const [editRosterRole, setEditRosterRole] = useState('');
  const [editRosterDuty, setEditRosterDuty] = useState('');
  const [editRosterStatus, setEditRosterStatus] = useState<'Active' | 'On Leave' | 'In Training'>('Active');
  const [editRosterEmail, setEditRosterEmail] = useState('');
  const [editRosterPhone, setEditRosterPhone] = useState('');

  // Add/Appoint Member Modal state
  const [showAddRosterModal, setShowAddRosterModal] = useState(false);
  const [addRosterName, setAddRosterName] = useState('');
  const [addRosterRole, setAddRosterRole] = useState('');
  const [addRosterDuty, setAddRosterDuty] = useState('');
  const [addRosterStatus, setAddRosterStatus] = useState<'Active' | 'On Leave' | 'In Training'>('Active');
  const [addRosterEmail, setAddRosterEmail] = useState('');
  const [addRosterPhone, setAddRosterPhone] = useState('');

  // Registered Congregation Members Directory
  const [congregationMembers, setCongregationMembers] = useState<Profile[]>([]);
  const [selectedCongregationMemberId, setSelectedCongregationMemberId] = useState('');

  useEffect(() => {
    let isMounted = true;
    getMembers()
      .then(data => {
        if (isMounted) setCongregationMembers(data);
      })
      .catch(error => {
        console.error('Unable to load church membership records:', error);
        if (isMounted) setCongregationMembers([]);
      });
    return () => { isMounted = false; };
  }, []);

  const openEditRosterMember = (member: any) => {
    setEditingRosterMember(member);
    setEditRosterName(member.name || '');
    setEditRosterRole(member.role || '');
    setEditRosterDuty(member.duty || '');
    setEditRosterStatus(member.status || 'Active');
    setEditRosterEmail(member.email || '');
    setEditRosterPhone(member.phone || '');
  };

  const handleSaveRosterEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRosterMember || !editRosterName.trim()) return;

    const updated = deptRoster.map(m => m.id === editingRosterMember.id ? {
      ...m,
      name: editRosterName.trim(),
      role: editRosterRole.trim() || 'Team Member',
      duty: editRosterDuty.trim() || 'Sunday Duty',
      status: editRosterStatus,
      email: editRosterEmail.trim(),
      phone: editRosterPhone.trim()
    } : m);

    updateDeptRoster(updated);
    setEditingRosterMember(null);
    setProposalSuccessToast(`Updated roster role & details for ${editRosterName.trim()}`);
    setTimeout(() => setProposalSuccessToast(null), 4000);
  };

  // Delete Member Modal state
  const [deletingRosterMember, setDeletingRosterMember] = useState<any | null>(null);

  const handleDeleteRosterMember = (member: any) => {
    setDeletingRosterMember(member);
  };

  const confirmDeleteRosterMember = () => {
    if (!deletingRosterMember) return;
    const memberId = deletingRosterMember.id;
    const memberName = deletingRosterMember.name;
    const updated = deptRoster.filter(m => m.id !== memberId);
    updateDeptRoster(updated);
    if (viewingRosterMember?.id === memberId) setViewingRosterMember(null);
    if (editingRosterMember?.id === memberId) setEditingRosterMember(null);
    setDeletingRosterMember(null);

    setProposalSuccessToast(`Removed ${memberName} from ${activeDept} roster.`);
    setTimeout(() => setProposalSuccessToast(null), 4000);
  };

  const openAddRosterModal = () => {
    setSelectedCongregationMemberId('');
    setAddRosterName('');
    setAddRosterRole('');
    setAddRosterDuty('');
    setAddRosterStatus('Active');
    setAddRosterEmail('');
    setAddRosterPhone('');
    setShowAddRosterModal(true);
  };

  const handleAddRosterMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addRosterName.trim()) return;

    const newMember = {
      id: `r_${Date.now()}`,
      name: addRosterName.trim(),
      role: addRosterRole.trim() || 'Team Member',
      duty: addRosterDuty.trim() || 'General Ministry Duty',
      status: addRosterStatus,
      email: addRosterEmail.trim(),
      phone: addRosterPhone.trim(),
      joined_date: new Date().toISOString().slice(0, 10)
    };

    const updated = [...deptRoster, newMember];
    updateDeptRoster(updated);
    setShowAddRosterModal(false);
    setProposalSuccessToast(`Appointed ${addRosterName.trim()} as ${newMember.role} in ${activeDept}!`);
    setTimeout(() => setProposalSuccessToast(null), 4000);
  };

  const reloadReqs = () => {
    setRequisitions(getRequisitions());
  };

  useEffect(() => {
    reloadReqs();
    const handleUpd = () => reloadReqs();
    window.addEventListener('requisitions_updated', handleUpd);
    return () => window.removeEventListener('requisitions_updated', handleUpd);
  }, []);

  if (!isLeaderOrStaff) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-xl mx-auto my-12 space-y-4 shadow-sm">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert size={36} />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Ministry Leader Access Only</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          The Leader Console is reserved for Grace Cathedral Department Leaders and Church Workers. As a congregation member, you can express interest in serving on the Ministries & Teams page!
        </p>
        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => navigate('/portal/ministries')}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Explore Ministries & Join
          </button>
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Return to Overview
          </button>
        </div>
      </div>
    );
  }

  const handleApproveVolunteer = (vId: string) => {
    const vol = volunteers.find(v => v.id === vId);
    if (vol) {
      setVolunteers(prev => prev.filter(v => v.id !== vId));
      const newMember = {
        id: `r_${Date.now()}`,
        name: vol.name,
        role: 'Team Member',
        status: 'Active',
        duty: 'General Roster & Sunday Support',
        email: vol.email || '',
        phone: vol.phone || '',
        joined_date: new Date().toISOString().slice(0, 10)
      };
      const updatedRoster = [...deptRoster, newMember];
      updateDeptRoster(updatedRoster);
      setProposalSuccessToast(`Approved ${vol.name} and added to ${activeDept} roster!`);
      setTimeout(() => setProposalSuccessToast(null), 4000);
    }
  };

  const handleAddNotice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoticeText.trim()) return;
    setNotices(prev => [
      {
        id: `n_${Date.now()}`,
        dept: activeDept,
        author: `${profile?.first_name} ${profile?.last_name}`,
        text: newNoticeText.trim(),
        date: new Date().toISOString()
      },
      ...prev
    ]);
    setNewNoticeText('');
  };

  // Editing Existing Proposal State
  const [editingReqId, setEditingReqId] = useState<string | null>(null);
  const [editingReqNum, setEditingReqNum] = useState<string | null>(null);

  const openNewProposalModal = () => {
    setEditingReqId(null);
    setEditingReqNum(null);
    setReqDept(activeDept);
    setReqApplicantName(profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader');
    setReqApplicantRole('Department Head');
    setReqTitle('');
    setReqDesc('');
    setReqPriority('high');
    setReqNeededDate('');
    setReqVendorQuote('');
    setReqDisbMethod('bank_transfer');
    setReqDisbInfo('');
    setReqItems([
      { item_name: 'Equipment / Service Quotation Item', quantity: 1, unit_price: 1500 }
    ]);
    setShowProposalModal(true);
  };

  const handleEditExistingProposal = (req: DepartmentRequisition) => {
    setEditingReqId(req.id);
    setEditingReqNum(req.requisition_number);
    setReqDept(req.department_name);
    setReqApplicantName(req.applicant_name);
    setReqApplicantRole(req.applicant_role || 'Ministry Lead');
    setReqTitle(req.title);
    setReqDesc(req.description || '');
    setReqPriority(req.priority);
    setReqNeededDate(req.needed_by_date || '');
    setReqVendorQuote(req.vendor_quote_url || '');
    setReqDisbMethod(req.disbursement_method || 'bank_transfer');
    setReqDisbInfo(req.disbursement_account_info || '');
    setReqItems(req.items.map(i => ({ item_name: i.item_name, quantity: i.quantity, unit_price: i.unit_price })));
    setShowProposalModal(true);
  };

  // Requisition Proposal Handlers
  const handleAddReqItemRow = () => {
    setReqItems(prev => [...prev, { item_name: '', quantity: 1, unit_price: 0 }]);
  };

  const handleRemoveReqItemRow = (index: number) => {
    setReqItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateReqItemRow = (index: number, field: string, val: any) => {
    setReqItems(prev => prev.map((item, idx) => idx === index ? { ...item, [field]: val } : item));
  };

  const handleSaveFundingProposal = (isDraft: boolean) => {
    if (!reqTitle.trim()) return;

    const formattedItems: RequisitionItem[] = reqItems.map((item, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      item_name: item.item_name || 'Equipment Item',
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
      total_price: (Number(item.quantity) || 1) * (Number(item.unit_price) || 0)
    }));

    const totalReqAmount = formattedItems.reduce((sum, item) => sum + item.total_price, 0);

    const targetReq: DepartmentRequisition = {
      id: editingReqId || `req-${Date.now()}`,
      requisition_number: editingReqNum || `REQ-2026-00${requisitions.length + 1}`,
      department_name: reqDept,
      applicant_name: reqApplicantName.trim() || `${profile?.first_name} ${profile?.last_name}`,
      applicant_role: reqApplicantRole.trim() || 'Ministry Leader',
      title: reqTitle.trim(),
      description: reqDesc.trim(),
      requested_amount: totalReqAmount > 0 ? totalReqAmount : 5000,
      currency: 'SLE',
      priority: reqPriority,
      status: isDraft ? 'draft' : 'pending_pastor_approval',
      created_at: new Date().toISOString(),
      needed_by_date: reqNeededDate || new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
      vendor_quote_url: reqVendorQuote.trim() || undefined,
      disbursement_method: reqDisbMethod,
      disbursement_account_info: reqDisbInfo.trim() || undefined,
      items: formattedItems
    };

    const exists = requisitions.some(r => r.id === targetReq.id);
    const updated = exists 
      ? requisitions.map(r => r.id === targetReq.id ? targetReq : r)
      : [targetReq, ...requisitions];

    saveRequisitions(updated);
    setRequisitions(updated);
    setShowProposalModal(false);
    setEditingReqId(null);
    setEditingReqNum(null);

    if (isDraft) {
      setProposalSuccessToast(`Proposal saved as Draft (${targetReq.requisition_number}). You can edit or submit it whenever you're ready!`);
    } else {
      setProposalSuccessToast(`Funding proposal ${targetReq.requisition_number} submitted! Sent to Senior Pastor Rev. Sarah Johnson for initial approval before reaching the Finance Officer.`);
    }
    setTimeout(() => setProposalSuccessToast(null), 6000);

    setReqTitle('');
    setReqDesc('');
    setReqVendorQuote('');
    setReqDisbInfo('');
  };

  const handlePromoteDraftToSubmit = (reqId: string) => {
    const updated = requisitions.map(r => r.id === reqId ? {
      ...r,
      status: 'pending_pastor_approval' as const
    } : r);

    saveRequisitions(updated);
    setRequisitions(updated);
    const target = requisitions.find(r => r.id === reqId);
    setProposalSuccessToast(`Draft proposal ${target?.requisition_number || ''} submitted to Senior Pastor Rev. Sarah Johnson & Finance Board!`);
    setTimeout(() => setProposalSuccessToast(null), 6000);
  };

  const handleDeleteProposal = (reqId: string) => {
    const updated = requisitions.filter(r => r.id !== reqId);
    saveRequisitions(updated);
    setRequisitions(updated);
    setProposalSuccessToast(`Proposal removed.`);
    setTimeout(() => setProposalSuccessToast(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 flex items-center gap-1">
              <Award size={12} className="text-amber-700" />
              Department Leader Console
            </span>
            <span className="text-xs text-slate-400 font-semibold">• Grace Cathedral Ministry Hub</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Ministry Leader Console</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Submit equipment funding proposals directly to finance, manage volunteer rosters, and post team announcements.
          </p>
        </div>

        {/* Action Button & Dept Selector / Restrict Badge */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openAddRosterModal}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-indigo-100 flex items-center gap-2 cursor-pointer transition-all shrink-0"
          >
            <UserPlus size={16} /> {
              (() => {
                const lower = (activeDept || '').toLowerCase();
                const isSocial = lower.includes('youth') || lower.includes('women') || lower.includes('men') || lower.includes('children') || lower.includes('fellowship') || lower.includes('social');
                return isSocial ? 'Add Member' : 'Add Volunteer';
              })()
            }
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInAppNotifModal(true)}
              className="relative p-2 sm:px-3 sm:py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 rounded-xl font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
              title="View In-App Contribution Reminders & Notifications"
            >
              <Bell size={15} className="text-purple-700 shrink-0" />
              <span className="hidden sm:inline font-bold">Reminders</span>
              {deptNotifications.filter(n => !n.is_read).length > 0 && (
                <span className="w-5 h-5 bg-rose-500 text-white rounded-full text-[10px] font-black flex items-center justify-center animate-pulse">
                  {deptNotifications.filter(n => !n.is_read).length}
                </span>
              )}
            </button>

            {canSwitchDepts ? (
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider px-2 flex items-center gap-1 shrink-0">
                  👑 Admin Access:
                </span>
                <select 
                  value={activeDept}
                  onChange={(e) => {
                    setActiveDept(e.target.value);
                    setReqDept(e.target.value);
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
                >
                  <option value="Media & IT Ministry">Media & IT Ministry</option>
                  <option value="Voices of Grace Choir">Voices of Grace Choir</option>
                  <option value="Kingdom Youth Ministry">Kingdom Youth Ministry</option>
                  <option value="Children Ministry">Children Ministry</option>
                  <option value="Outreach & Evangelism">Outreach & Evangelism</option>
                  <option value="Ushers & Hospitality">Ushers & Hospitality</option>
                  <option value="Intercessory Prayer Team">Intercessory Prayer Team</option>
                </select>
              </div>
            ) : (
              <div className="px-3.5 py-2 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2 text-xs font-extrabold text-indigo-900 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                <span>🔒 {activeDept} Console</span>
                <span className="text-[10px] font-normal text-indigo-600 font-mono">(Assigned Leader View)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Console Sub-Tab Switcher - Fits 1 line with zero scrollbar */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => setLeaderConsoleSubTab('finance')}
          className={`py-2.5 px-1.5 sm:px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-2 truncate ${
            leaderConsoleSubTab === 'finance'
              ? 'bg-white text-indigo-700 shadow-xs font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Landmark size={16} className="shrink-0 text-indigo-600" />
          <span className="truncate">💳 Financials</span>
          <span className="hidden lg:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 shrink-0">
            {requisitions.length + deptLedgerRecords.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setLeaderConsoleSubTab('roster')}
          className={`py-2.5 px-1.5 sm:px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-2 truncate ${
            leaderConsoleSubTab === 'roster'
              ? 'bg-white text-indigo-700 shadow-xs font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users size={16} className="shrink-0 text-indigo-600" />
          <span className="truncate">👥 Team Roster</span>
          <span className="hidden lg:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800 shrink-0">
            {deptRoster.length} Active
          </span>
        </button>

        <button
          type="button"
          onClick={() => setLeaderConsoleSubTab('welfare')}
          className={`py-2.5 px-1.5 sm:px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-2 truncate ${
            leaderConsoleSubTab === 'welfare'
              ? 'bg-white text-purple-700 shadow-xs font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Heart size={16} className="shrink-0 text-purple-600" />
          <span className="truncate">🤝 Welfare & Dues</span>
          <span className="hidden lg:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 shrink-0">
            {memberContributions.length} Records
          </span>
        </button>
      </div>

      {/* MEMBER TASKS & ACTION ITEMS WIDGET */}
      {(() => {
        const allTasks = getMemberActionableTasks(activeDept, deptRoster, volunteers)
          .filter(t => !dismissedTaskIds.includes(t.id));
        const urgentCount = allTasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length;

        const filteredTasks = allTasks.filter(t => {
          if (memberTaskFilter === 'pending_contrib') return t.task_type === 'pending_contribution';
          if (memberTaskFilter === 'duty') return t.task_type === 'duty_reminder';
          if (memberTaskFilter === 'profile') return t.task_type === 'profile_completion' || t.task_type === 'volunteer_assignment';
          return true;
        });

        return (
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold shrink-0">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-slate-900">Member Tasks & Action Items</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-900">
                      {allTasks.length} Pending
                    </span>
                    {urgentCount > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 animate-pulse">
                        {urgentCount} Urgent / Past Due
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aggregated pending action items per member across contributions, roster duties, and profile completions.
                  </p>
                </div>
              </div>

              {/* Task Filter Pills */}
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                {[
                  { id: 'all', label: `All (${allTasks.length})` },
                  { id: 'pending_contrib', label: 'Contributions & Dues' },
                  { id: 'duty', label: 'Duty Reminders' },
                  { id: 'profile', label: 'Profiles & Volunteers' }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMemberTaskFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition-all ${
                      memberTaskFilter === f.id ? 'bg-white text-indigo-900 shadow-2xs font-black' : 'text-slate-600'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tasks List */}
            {filteredTasks.length === 0 ? (
              <div className="p-6 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                🎉 All member action items up to date for {activeDept}! No pending tasks requiring leader attention.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {filteredTasks.map(task => (
                  <div
                    key={task.id}
                    className="p-3.5 bg-slate-50 hover:bg-white hover:shadow-xs transition-all rounded-2xl border border-slate-200 space-y-2 text-xs flex flex-col justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                            {task.member_name[0]}
                          </span>
                          <div>
                            <h4 className="font-extrabold text-slate-900 text-xs">{task.member_name}</h4>
                            <span className={`inline-block px-2 py-0.2 rounded-full text-[9px] font-extrabold uppercase border ${task.badge_color}`}>
                              {task.priority.toUpperCase()} • {task.task_type.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        {task.due_date && (
                          <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                            Due: {task.due_date}
                          </span>
                        )}
                      </div>

                      <div className="pt-1">
                        <h5 className="font-bold text-slate-800 text-xs">{task.title}</h5>
                        <p className="text-slate-500 text-[11px] leading-tight mt-0.5">{task.description}</p>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                      <div className="flex items-center gap-1.5">
                        {task.task_type === 'pending_contribution' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                sendInAppNotification({
                                  department_name: activeDept,
                                  recipient_member_id: task.member_id,
                                  recipient_member_name: task.member_name,
                                  type: 'welfare_reminder',
                                  title: task.title,
                                  message: task.description,
                                  sent_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader'
                                });
                                setProposalSuccessToast(`🔔 Sent in-app reminder to ${task.member_name}`);
                                setTimeout(() => setProposalSuccessToast(null), 3000);
                              }}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Bell size={11} /> Remind
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setContribMemberId(task.member_id);
                                setContribMemberName(task.member_name);
                                setContribAmount(task.amount || '');
                                setShowRecordContribModal(true);
                              }}
                              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Plus size={11} /> Log Payment
                            </button>
                          </>
                        )}

                        {task.task_type === 'duty_reminder' && (
                          <button
                            type="button"
                            onClick={() => {
                              sendInAppNotification({
                                department_name: activeDept,
                                recipient_member_id: task.member_id,
                                recipient_member_name: task.member_name,
                                type: 'general_notice',
                                title: task.title,
                                message: `Friendly reminder for ${task.member_name}: You have been assigned for roster duty: ${task.description}. Thank you for your faithful service!`,
                                sent_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader'
                              });
                              setProposalSuccessToast(`🔔 Duty reminder sent to ${task.member_name}`);
                              setTimeout(() => setProposalSuccessToast(null), 3000);
                            }}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <Bell size={11} /> Remind Duty
                          </button>
                        )}

                        {task.task_type === 'volunteer_assignment' && (
                          <button
                            type="button"
                            onClick={() => {
                              handleApproveVolunteer(task.member_id);
                              setDismissedTaskIds(prev => [...prev, task.id]);
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <Check size={11} /> Approve & Add
                          </button>
                        )}

                        {task.task_type === 'profile_completion' && (
                          <button
                            type="button"
                            onClick={() => {
                              const found = deptRoster.find(r => r.id === task.member_id);
                              if (found) openEditRosterMember(found);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <Edit size={11} /> Update Profile
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setDismissedTaskIds(prev => [...prev, task.id])}
                        className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer font-extrabold"
                        title="Dismiss Task"
                      >
                        ✓ Mark Done
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Success Notification Banner */}
      {proposalSuccessToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{proposalSuccessToast}</span>
          </div>
          <button onClick={() => setProposalSuccessToast(null)} className="text-emerald-500 hover:text-emerald-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* UNIFIED MODULE: DEPARTMENT FINANCIALS, PROPOSALS & LEDGER */}
      {leaderConsoleSubTab === 'finance' ? (
        <div className="space-y-6">
          {/* Summary KPIs & Governance Status Bar */}
          {(() => {
            const summary = getDepartmentLedgerSummary(activeDept);
            const activeDeptStanding = getDepartmentFinancialStanding(activeDept, requisitions);
            return (
              <div className="space-y-3">
                {/* 3 Summary KPI Cards */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <div className="bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] sm:text-xs font-black uppercase text-slate-500 tracking-tight leading-tight">
                        REVENUE
                      </span>
                      <span className="w-6 h-6 sm:w-8 sm:h-8 bg-emerald-50 text-emerald-600 rounded-lg sm:rounded-xl flex items-center justify-center font-black shrink-0">
                        <DollarSign size={14} className="sm:w-4 sm:h-4" />
                      </span>
                    </div>
                    <div className="text-sm sm:text-2xl font-black text-emerald-600 font-mono tracking-tight my-0.5">
                      SLE {summary.totalIncome.toLocaleString()}
                    </div>
                    <p className="text-[9px] sm:text-[11px] text-slate-400 line-clamp-1">Offerings & Grants</p>
                  </div>

                  <div className="bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] sm:text-xs font-black uppercase text-slate-500 tracking-tight leading-tight">
                        EXPENSES
                      </span>
                      <span className="w-6 h-6 sm:w-8 sm:h-8 bg-rose-50 text-rose-600 rounded-lg sm:rounded-xl flex items-center justify-center font-black shrink-0">
                        <ShoppingCart size={14} className="sm:w-4 sm:h-4" />
                      </span>
                    </div>
                    <div className="text-sm sm:text-2xl font-black text-rose-600 font-mono tracking-tight my-0.5">
                      SLE {summary.totalExpenses.toLocaleString()}
                    </div>
                    <p className="text-[9px] sm:text-[11px] text-slate-400 line-clamp-1">Supplies & Repairs</p>
                  </div>

                  <div className="bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] sm:text-xs font-black uppercase text-slate-500 tracking-tight leading-tight">
                        NET BALANCE
                      </span>
                      <span className="w-6 h-6 sm:w-8 sm:h-8 bg-indigo-50 text-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center font-black shrink-0">
                        <Landmark size={14} className="sm:w-4 sm:h-4" />
                      </span>
                    </div>
                    <div className={`text-sm sm:text-2xl font-black font-mono tracking-tight my-0.5 ${summary.netBalance >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                      SLE {summary.netBalance.toLocaleString()}
                    </div>
                    <p className="text-[9px] sm:text-[11px] text-slate-400 line-clamp-1">Treasury Liquidity</p>
                  </div>
                </div>

                {/* Governance Bar */}
                <div className="bg-slate-900 text-white px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                    <span>Standing: <strong className="text-emerald-300 font-black">{activeDeptStanding.standing_status}</strong> ({activeDept})</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-slate-300">Compliance: <strong className="text-emerald-400">{activeDeptStanding.reconciliation_compliance_rate}%</strong></span>
                    <span className="hidden sm:inline-block text-slate-400">•</span>
                    <span className="hidden sm:inline-block text-slate-300">Disbursed: <strong>SLE {activeDeptStanding.total_disbursed_amount.toLocaleString()}</strong></span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Inner Section Switcher Card */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              {/* Clean 2-Option Switcher */}
              <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 max-w-sm w-full">
                <button
                  type="button"
                  onClick={() => setFinanceSectionFilter('proposals')}
                  className={`py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 truncate ${
                    financeSectionFilter !== 'ledger'
                      ? 'bg-white text-indigo-900 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShoppingCart size={14} className="text-indigo-600 shrink-0" />
                  <span className="truncate">Budget Proposals ({requisitions.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFinanceSectionFilter('ledger')}
                  className={`py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 truncate ${
                    financeSectionFilter === 'ledger'
                      ? 'bg-white text-indigo-900 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Landmark size={14} className="text-emerald-600 shrink-0" />
                  <span className="truncate">Income & Expense ({deptLedgerRecords.length})</span>
                </button>
              </div>

              {/* View-Specific Actions */}
              {financeSectionFilter !== 'ledger' && (
                <button
                  type="button"
                  onClick={openNewProposalModal}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all self-start sm:self-auto"
                >
                  <Plus size={15} /> Draft Funding Proposal
                </button>
              )}
            </div>

            {/* SECTION 1: INTERNAL FUNDING PROPOSALS & INVOICES */}
            {financeSectionFilter !== 'ledger' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <ShoppingCart size={16} className="text-indigo-600" />
                    Internal Funding Proposals & Proforma Invoices ({requisitions.length})
                  </h4>
                  <button
                    type="button"
                    onClick={openNewProposalModal}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    + Draft New Proposal
                  </button>
                </div>

            {/* List of Funding Proposals */}
            <div className="space-y-4 pt-1">
              {requisitions.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  No funding proposals submitted yet. Click "Draft New Proposal" to request budget for your ministry!
                </div>
              ) : (
                requisitions.map(req => {
                  const isUrgent = req.priority === 'urgent' || req.priority === 'high';
                  return (
                    <div key={req.id} className="bg-slate-50 rounded-3xl border border-slate-200 p-6 space-y-4 hover:bg-white hover:shadow-sm transition-all">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                              {req.requisition_number}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900">
                              {req.department_name}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isUrgent ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              Priority: {req.priority}
                            </span>
                          </div>
                          <h4 className="text-xl font-black text-slate-900">{req.title}</h4>
                          <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">{req.description}</p>
                        </div>

                        <div className="text-left md:text-right shrink-0">
                          <span className="text-[10px] font-extrabold uppercase text-slate-400">Total Requested Amount</span>
                          <div className="text-2xl font-black text-indigo-700">
                            {req.currency || 'SLE'} {req.requested_amount.toLocaleString()}
                          </div>
                          <span className={`inline-block mt-1 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            req.status === 'draft' ? 'bg-amber-100 text-amber-900 border border-amber-300 font-extrabold' :
                            req.status === 'pending_pastor_approval' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                            req.status === 'pastor_approved' ? 'bg-purple-600 text-white font-bold' :
                            req.status === 'pending_approval' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                            req.status === 'submitted_to_board' ? 'bg-purple-100 text-purple-800 animate-bounce' :
                            req.status === 'approved' ? 'bg-indigo-100 text-indigo-800 font-bold' :
                            req.status === 'disbursed' ? 'bg-emerald-100 text-emerald-800 font-bold' :
                            req.status === 'reconciled' ? 'bg-teal-100 text-teal-800 font-bold' :
                            req.status === 'settled' ? 'bg-emerald-800 text-white font-bold' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {req.status === 'draft' ? '📝 Draft (Saved — Not Submitted)' :
                             req.status === 'pending_pastor_approval' ? 'Step 1: Awaiting Senior Pastor Approval' :
                             req.status === 'pastor_approved' ? 'Step 2: Approved by Senior Pastor — Sent to Finance' :
                             req.status === 'pending_approval' ? 'Under Finance Triage' : 
                             req.status === 'submitted_to_board' ? 'Escalated to Executive Board' :
                             req.status === 'approved' ? 'Authorized by Board' :
                             req.status === 'disbursed' ? 'Disbursed (Awaiting Receipts)' :
                             req.status === 'reconciled' ? 'Receipts Uploaded (Under Audit)' :
                             req.status === 'settled' ? 'Audited & Settled in Good Standing' :
                             req.status}
                          </span>
                        </div>
                      </div>

                      {/* Equipment Items Itemization */}
                      <div className="p-3 bg-white rounded-2xl border border-slate-200/80 text-xs">
                        <div className="font-extrabold text-slate-700 mb-2 flex items-center justify-between">
                          <span>Itemized Equipment Breakdown ({req.items.length} Items):</span>
                          <span className="text-slate-400 text-[11px]">Submitted By: {req.applicant_name} ({req.applicant_role || 'Lead'})</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {req.items.map(i => (
                            <div key={i.id} className="py-1.5 flex justify-between items-center text-slate-800">
                              <span>{i.item_name} <strong className="text-slate-400 font-normal">x{i.quantity}</strong></span>
                              <strong className="font-mono text-slate-900">SLE {i.total_price.toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Submitted Receipts & Reconciliation Preview */}
                      {(req.status === 'reconciled' || req.status === 'settled') && (
                        <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-2xl text-xs space-y-1.5 text-teal-950">
                          <div className="flex justify-between font-black">
                            <span className="flex items-center gap-1 text-teal-800">
                              <CheckCircle2 size={15} className="text-teal-600" />
                              Expenditure Report & Vendor Tax Receipt Submitted
                            </span>
                            <span className="font-mono">Spent: SLE {(req.actual_amount_spent || req.requested_amount).toLocaleString()}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 pt-0.5">
                            <span>Receipt Proof: <strong className="text-indigo-700 font-mono">{req.receipt_proof_url}</strong></span>
                            <span>Unspent Returned: <strong className="text-emerald-700 font-mono">SLE {(req.unspent_balance_returned || 0).toLocaleString()}</strong></span>
                          </div>
                          {req.receipt_notes && <p className="italic text-slate-600 text-[11px]">"{req.receipt_notes}"</p>}
                        </div>
                      )}

                      <div className="text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div>
                          <span>Preferred Payment: <strong className="text-slate-800 uppercase">{req.disbursement_method?.replace('_', ' ')}</strong></span>
                          {req.disbursement_account_info && (
                            <span className="ml-3 font-mono text-slate-700">• Account: {req.disbursement_account_info}</span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {req.status === 'draft' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditExistingProposal(req)}
                                className="px-3.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer border border-amber-300"
                              >
                                <Edit size={14} /> Edit Draft
                              </button>

                              <button
                                type="button"
                                onClick={() => handlePromoteDraftToSubmit(req.id)}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Send size={14} /> Submit for Approval
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteProposal(req.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                title="Delete Draft"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewProposal({ ...req, items: req.items.map(i => ({ ...i })) });
                                setShowProposalPreviewModal(true);
                              }}
                              className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-extrabold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                            >
                              <FileText size={14} /> View Proforma Invoice
                            </button>
                          )}

                          {req.status === 'disbursed' && (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-emerald-700 font-semibold">Ref: {req.transaction_ref}</span>
                              <button
                                type="button"
                                onClick={() => openReconcileModal(req)}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md shadow-emerald-100 flex items-center gap-1.5 cursor-pointer transition-all animate-pulse"
                              >
                                <Upload size={14} /> Reconcile Spending & Upload Receipts
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          )}

          {/* SECTION 2: DEPARTMENT INCOME & EXPENSE LEDGER */}
          {(financeSectionFilter === 'all' || financeSectionFilter === 'ledger') && (
            <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                    Treasury Ledger
                  </span>
                  <h4 className="text-lg sm:text-xl font-black text-slate-900 mt-1 flex items-center gap-2">
                    <Landmark size={18} className="text-emerald-600" />
                    Department Income & Expense Ledger ({deptLedgerRecords.length} Entries)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                    Track and record ministry offerings, event collections, equipment repairs, and physical vendor receipts.
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-1.5 sm:flex sm:items-center sm:gap-2 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
                  <button
                    type="button"
                    onClick={() => {
                      setDeptRecordType('income');
                      setDeptRecordCategory('Ministry Offering & Grants');
                      setShowDeptRecordModal(true);
                    }}
                    className="px-2 sm:px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs transition-all whitespace-nowrap"
                  >
                    <Plus size={14} className="shrink-0" />
                    <span className="hidden sm:inline">Record </span>Income
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDeptRecordType('expense');
                      setDeptRecordCategory('Equipment Maintenance & Supplies');
                      setShowDeptRecordModal(true);
                    }}
                    className="px-2 sm:px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs transition-all whitespace-nowrap"
                  >
                    <Plus size={14} className="shrink-0" />
                    <span className="hidden sm:inline">Record </span>Expense
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScannerContext('ledger');
                      setShowDocumentScanner(true);
                    }}
                    className="px-2 sm:px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs transition-all whitespace-nowrap"
                    title="Scan Receipt Photo"
                  >
                    <Camera size={14} className="shrink-0" />
                    <span className="hidden sm:inline">Scan </span>Receipt
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowReportGeneratorModal(true)}
                    className="px-2 sm:px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs transition-all whitespace-nowrap"
                    title="Generate PDF Audit Report"
                  >
                    <Printer size={14} className="shrink-0" />
                    <span className="hidden sm:inline">Audit </span>Report
                  </button>
                </div>
              </div>

            {/* Department Ledger Records List */}
            {deptLedgerRecords.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                No ledger records found for {activeDept}. Click "+ Record Income" or "+ Record Expense" to log transactions!
              </div>
            ) : (
              <div>
                {/* Desktop View Table (hidden on mobile, visible on md+) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 bg-slate-50/50">
                        <th className="p-3">Date</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Category & Description</th>
                        <th className="p-3">Vendor / Payer</th>
                        <th className="p-3">Method</th>
                        <th className="p-3">Receipt Proof</th>
                        <th className="p-3 text-right">Amount (SLE)</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deptLedgerRecords.map(rec => (
                        <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 font-semibold text-slate-600">
                            {new Date(rec.date).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              rec.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {rec.type}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-extrabold text-slate-900">{rec.category}</div>
                            <div className="text-slate-500 text-[11px]">{rec.description}</div>
                          </td>
                          <td className="p-3 font-medium text-slate-700">
                            {rec.vendor_name || '—'}
                          </td>
                          <td className="p-3 font-mono uppercase text-slate-500 text-[10px]">
                            {rec.payment_method?.replace('_', ' ')}
                          </td>
                          <td className="p-3">
                            {rec.receipt_image_url ? (
                              <button
                                type="button"
                                onClick={() => setInspectingReceiptUrl(rec.receipt_image_url!)}
                                className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                              >
                                <Eye size={12} /> View Proof
                              </button>
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">No Attachment</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-black font-mono">
                            <span className={rec.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}>
                              {rec.type === 'income' ? '+' : '-'}{rec.amount.toLocaleString()}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                deleteDepartmentLedgerRecord(rec.id, activeDept);
                                setDeptLedgerRecords(getDepartmentLedgerRecords(activeDept));
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Ledger Entry"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile / Tablet Card View (visible on mobile, hidden on md+) */}
                <div className="md:hidden space-y-3">
                  {deptLedgerRecords.map(rec => (
                    <div key={rec.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            rec.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {rec.type}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {new Date(rec.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="font-black font-mono text-sm">
                          <span className={rec.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}>
                            {rec.type === 'income' ? '+' : '-'}{rec.amount.toLocaleString()} SLE
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="font-extrabold text-slate-900">{rec.category}</div>
                        <div className="text-slate-600 text-[11px] mt-0.5">{rec.description}</div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                        <div>
                          <span>Vendor/Payer: <strong className="text-slate-800">{rec.vendor_name || '—'}</strong></span>
                          <span className="ml-2 font-mono uppercase text-[9px] text-slate-400">({rec.payment_method?.replace('_', ' ')})</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {rec.receipt_image_url && (
                            <button
                              type="button"
                              onClick={() => setInspectingReceiptUrl(rec.receipt_image_url!)}
                              className="px-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={12} /> Proof
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              deleteDepartmentLedgerRecord(rec.id, activeDept);
                              setDeptLedgerRecords(getDepartmentLedgerRecords(activeDept));
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Delete Ledger Entry"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
      ) : leaderConsoleSubTab === 'roster' ? (
        /* MODULE 3: ROSTER & ANNOUNCEMENTS VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Department Roster and Duty Assignments */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                      Team Roster
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">• {deptRoster.length} Appointed Members</span>
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-lg">{activeDept} Roster & Duties</h3>
                </div>

                <button
                  type="button"
                  onClick={openAddRosterModal}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all self-start sm:self-auto"
                >
                  <UserPlus size={15} /> Appoint Team Member
                </button>
              </div>

              {deptRoster.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                  No appointed team members found for {activeDept}. Click "+ Appoint Team Member" to add leaders or workers!
                </div>
              ) : (
                <div className="space-y-3">
                  {deptRoster.map(member => (
                    <div key={member.id} className="p-4 bg-slate-50 hover:bg-white hover:shadow-xs transition-all rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                          {member.name ? member.name[0].toUpperCase() : 'M'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-slate-900 text-sm">{member.name}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              member.status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                              member.status === 'On Leave' ? 'bg-amber-100 text-amber-800' :
                              'bg-indigo-100 text-indigo-800'
                            }`}>
                              {member.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-indigo-700 font-bold">{member.role}</p>
                          {(member.email || member.phone) && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {member.email && <span>{member.email}</span>}
                              {member.email && member.phone && <span> • </span>}
                              {member.phone && <span>{member.phone}</span>}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Duty</span>
                          <span className="font-bold text-slate-800">{member.duty}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pl-2">
                          <button
                            type="button"
                            onClick={() => openViewWelfareCard(member)}
                            className="p-1.5 bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 rounded-lg cursor-pointer transition-colors shadow-2xs"
                            title="View Member Digital Welfare Passbook"
                          >
                            <CreditCard size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openRecordContribForMember(member)}
                            className="p-1.5 bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 rounded-lg cursor-pointer transition-colors shadow-2xs"
                            title="Log Welfare, Dues or Task Contribution"
                          >
                            <Plus size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setViewingRosterMember(member)}
                            className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 rounded-lg cursor-pointer transition-colors shadow-2xs"
                            title="View Member Profile & Duty Details"
                          >
                            <Eye size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditRosterMember(member)}
                            className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:text-amber-600 hover:border-amber-200 rounded-lg cursor-pointer transition-colors shadow-2xs"
                            title="Edit Role Title & Duty Assignment"
                          >
                            <Edit size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteRosterMember(member)}
                            className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-200 rounded-lg cursor-pointer transition-colors shadow-2xs"
                            title="Remove Member from Roster"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Volunteer Inquiries */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-900 text-base">Pending Volunteer Requests ({volunteers.length})</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded">
                  Action Needed
                </span>
              </div>

              {volunteers.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">No pending volunteer applications for {activeDept}.</p>
              ) : (
                <div className="space-y-3">
                  {volunteers.map(vol => (
                    <div key={vol.id} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-900">{vol.name}</h4>
                          <p className="text-slate-500">{vol.email} • {vol.phone}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApproveVolunteer(vol.id)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Approve & Add
                        </button>
                      </div>
                      <p className="text-slate-600 italic bg-white p-2.5 rounded-xl border border-slate-200">
                        "{vol.note}"
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notices & Department Announcements */}
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="font-extrabold text-slate-900 text-base">Post Department Notice</h3>
              <form onSubmit={handleAddNotice} className="space-y-3">
                <textarea
                  rows={3}
                  required
                  placeholder={`Broadcast announcement to ${activeDept} members...`}
                  value={newNoticeText}
                  onChange={(e) => setNewNoticeText(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!newNoticeText.trim()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Post Team Notice
                </button>
              </form>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Announcements</h4>
                {notices.map(notice => (
                  <div key={notice.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1">
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>{notice.author}</span>
                      <span className="text-[10px] text-slate-400">{new Date(notice.date).toLocaleDateString()}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{notice.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : leaderConsoleSubTab === 'welfare' ? (
        /* MODULE 4: WELFARE, DUES & MEMBER PASSBOOKS VIEW */
        <div className="space-y-6">
          {/* Top Welfare Header KPI Summary */}
          {(() => {
            const summary = getDeptWelfareSummary(activeDept);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <div className="bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] sm:text-xs font-black uppercase text-purple-700 tracking-tight leading-tight">
                        WELFARE DRIVES
                      </span>
                      <span className="w-6 h-6 sm:w-8 sm:h-8 bg-purple-50 text-purple-600 rounded-lg sm:rounded-xl flex items-center justify-center font-black shrink-0">
                        <Heart size={14} className="sm:w-4 sm:h-4" />
                      </span>
                    </div>
                    <div className="text-sm sm:text-2xl font-black text-purple-900 font-mono tracking-tight my-0.5">
                      SLE {summary.totalWelfare.toLocaleString()}
                    </div>
                    <p className="text-[9px] sm:text-[11px] text-slate-400 line-clamp-1">{summary.activeCampaignsCount} Active Drives</p>
                  </div>

                  <div className="bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] sm:text-xs font-black uppercase text-emerald-700 tracking-tight leading-tight">
                        MONTHLY DUES
                      </span>
                      <span className="w-6 h-6 sm:w-8 sm:h-8 bg-emerald-50 text-emerald-600 rounded-lg sm:rounded-xl flex items-center justify-center font-black shrink-0">
                        <Landmark size={14} className="sm:w-4 sm:h-4" />
                      </span>
                    </div>
                    <div className="text-sm sm:text-2xl font-black text-emerald-900 font-mono tracking-tight my-0.5">
                      SLE {summary.totalMonthlyDues.toLocaleString()}
                    </div>
                    <p className="text-[9px] sm:text-[11px] text-slate-400 line-clamp-1">Regular Dues Fund</p>
                  </div>

                  <div className="bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] sm:text-xs font-black uppercase text-blue-700 tracking-tight leading-tight">
                        PLEDGES & TASKS
                      </span>
                      <span className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-50 text-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center font-black shrink-0">
                        <Trophy size={14} className="sm:w-4 sm:h-4" />
                      </span>
                    </div>
                    <div className="text-sm sm:text-2xl font-black text-blue-900 font-mono tracking-tight my-0.5">
                      SLE {summary.totalSpecialSupport.toLocaleString()}
                    </div>
                    <p className="text-[9px] sm:text-[11px] text-slate-400 line-clamp-1">Equipment & Pledges</p>
                  </div>
                </div>

                {/* Sub-Tab Navigation Bar */}
                <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveWelfareTab('drives');
                        setSelectedCampaignDriveId('');
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5 truncate ${
                        activeWelfareTab === 'drives' ? 'bg-purple-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Heart size={14} className="shrink-0" />
                      <span className="truncate">Welfare Drives ({welfareCampaigns.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveWelfareTab('monthly_dues')}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5 truncate ${
                        activeWelfareTab === 'monthly_dues' ? 'bg-emerald-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Landmark size={14} className="shrink-0" />
                      <span className="truncate">Monthly Dues</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveWelfareTab('cards')}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5 truncate ${
                        activeWelfareTab === 'cards' ? 'bg-indigo-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <CreditCard size={14} className="shrink-0" />
                      <span className="truncate">Passbook Cards</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveWelfareTab('ledger')}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5 truncate ${
                        activeWelfareTab === 'ledger' ? 'bg-slate-900 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ClipboardList size={14} className="shrink-0" />
                      <span className="truncate">All Ledgers</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setCampBeneficiaryId('');
                        setCampBeneficiaryName('');
                        setCampReason('marriage');
                        setCampTitle('');
                        setCampDesc('');
                        setCampExpectedPerMember(200);
                        setCampTargetTotal(2000);
                        setCampDeadline('2026-11-28');
                        setShowLaunchCampaignModal(true);
                      }}
                      className="px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-950 font-extrabold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Plus size={14} /> Launch Member Drive
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setContribCampaignId('');
                        setContribMemberId('');
                        setContribMemberName('');
                        setContribCategory('welfare');
                        setContribWelfareReason('marriage');
                        setContribSpecialPurpose('');
                        setContribMonthYear('2026-11');
                        setContribAmount('');
                        setContribPaymentMethod('mobile_money');
                        setContribRef('');
                        setContribNotes('');
                        setShowRecordContribModal(true);
                      }}
                      className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                    >
                      <Plus size={14} /> Log Payment
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 1: DEDICATED WELFARE CAMPAIGN DRIVES & MEMBER LEDGERS */}
          {activeWelfareTab === 'drives' && (
            <div className="space-y-6">
              {/* Drives Header */}
              <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                    <Heart size={20} className="text-purple-600" />
                    Dedicated Member Welfare Support Drives
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                    Dedicated ledgers for specific member needs (marriage, bereavement, medical, naming) specifying target per member & deadline.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLaunchCampaignModal(true)}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all self-start sm:self-auto"
                >
                  <Plus size={15} /> Launch Member Welfare Drive
                </button>
              </div>

              {/* List of Dedicated Welfare Campaign Drives */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {welfareCampaigns.map(camp => {
                  const campContribs = memberContributions.filter(c => c.campaign_id === camp.id || (c.welfare_reason === camp.reason && c.category === 'welfare'));
                  const totalRaised = campContribs.reduce((s, c) => s + Number(c.amount), 0);
                  const progressPct = Math.min(100, Math.round((totalRaised / (camp.target_total_amount || 1)) * 100));
                  const isSelected = selectedCampaignDriveId === camp.id;

                  return (
                    <div 
                      key={camp.id} 
                      className={`p-5 rounded-3xl border transition-all space-y-4 ${
                        isSelected 
                          ? 'bg-purple-50/70 border-purple-400 shadow-md ring-2 ring-purple-500/20' 
                          : 'bg-white border-slate-200 shadow-xs hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900">
                              {getWelfareReasonLabel(camp.reason)}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              Deadline: {camp.deadline}
                            </span>
                          </div>
                          <h4 className="font-extrabold text-slate-900 text-base">{camp.title}</h4>
                          <p className="text-xs text-slate-600 mt-0.5">Beneficiary: <strong className="text-purple-900 font-bold">{camp.beneficiary_member_name}</strong></p>
                        </div>
                      </div>

                      {camp.description && (
                        <p className="text-xs text-slate-500 italic bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                          "{camp.description}"
                        </p>
                      )}

                      {/* Progress Bar & Target Financials */}
                      <div className="space-y-1.5 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <div className="flex justify-between items-center text-xs font-extrabold">
                          <span className="text-slate-600">Progress: <strong className="text-purple-900 font-mono">SLE {totalRaised.toLocaleString()}</strong> raised</span>
                          <span className="text-slate-400 font-mono">Goal: SLE {camp.target_total_amount.toLocaleString()} ({progressPct}%)</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                          <div className="bg-purple-600 h-full transition-all duration-500 rounded-full" style={{ width: `${progressPct}%` }}></div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-500 pt-0.5">
                          <span>Target Per Member: <strong className="text-slate-800 font-mono font-bold">SLE {camp.expected_amount_per_member.toLocaleString()}</strong></span>
                          <span>{campContribs.length} Donors Participated</span>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedCampaignDriveId(isSelected ? '' : camp.id)}
                          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                            isSelected ? 'bg-purple-900 text-white shadow-xs' : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200'
                          }`}
                        >
                          <ClipboardList size={14} /> {isSelected ? 'Hide Drive Ledger' : 'View Member Drive Ledger'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const pendingList = deptRoster.filter(m => {
                              const paidSum = campContribs.filter(c => c.member_id === m.id || c.member_name.toLowerCase() === m.name.toLowerCase()).reduce((s, c) => s + Number(c.amount), 0);
                              return paidSum < camp.expected_amount_per_member;
                            });
                            const count = sendDriveReminderToPendingMembers(activeDept, camp, pendingList, profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader');
                            setProposalSuccessToast(`🔔 Sent in-app reminders to ${count} pending member(s) for "${camp.title}"`);
                            setTimeout(() => setProposalSuccessToast(null), 4000);
                          }}
                          className="py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs transition-all"
                          title="Send In-App Notification Reminder to all pending members"
                        >
                          <Bell size={14} /> Remind Pending
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setContribCampaignId(camp.id);
                            setContribCategory('welfare');
                            setContribWelfareReason(camp.reason);
                            setContribAmount(camp.expected_amount_per_member);
                            setContribNotes(`Contribution towards ${camp.title}`);
                            setShowRecordContribModal(true);
                          }}
                          className="py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs transition-all"
                        >
                          <Plus size={14} /> Record Payment
                        </button>
                      </div>

                      {/* Dedicated Member Assessment Ledger (Expanded when selected) */}
                      {isSelected && (
                        <div className="pt-4 border-t border-purple-200 space-y-3 animate-in fade-in">
                          <div className="flex items-center justify-between">
                            <h5 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                              <Users size={14} className="text-purple-600" />
                              Dedicated Member Ledger for {camp.beneficiary_member_name}
                            </h5>
                            <span className="text-[10px] text-purple-700 font-bold bg-purple-100 px-2 py-0.5 rounded-full">
                              Expected: SLE {camp.expected_amount_per_member} / member
                            </span>
                          </div>

                          <div className="space-y-2">
                            {deptRoster.map(m => {
                              const paidList = campContribs.filter(c => c.member_id === m.id || c.member_name.toLowerCase() === m.name.toLowerCase());
                              const paidSum = paidList.reduce((s, c) => s + Number(c.amount), 0);
                              const isFull = paidSum >= camp.expected_amount_per_member;
                              const isPartial = paidSum > 0 && paidSum < camp.expected_amount_per_member;

                              return (
                                <div key={m.id} className="p-3 bg-white rounded-2xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 font-bold text-slate-700 flex items-center justify-center shrink-0 text-xs">
                                      {m.name[0]}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-extrabold text-slate-900">{m.name}</span>
                                        {(() => {
                                          const standing = getMemberReciprocityRating(m.id, m.name, activeDept);
                                          return (
                                            <span 
                                              className={`px-1.5 py-0.2 rounded-full text-[8px] font-black border uppercase ${standing.badge_color}`}
                                              title={`Lifetime Drive Reciprocity: ${standing.standing_label} — ${standing.welfare_eligibility_note}`}
                                            >
                                              {standing.standing_label}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      <span className="text-[10px] text-slate-400 block">{m.role}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black ${
                                      isFull ? 'bg-emerald-100 text-emerald-800' :
                                      isPartial ? 'bg-amber-100 text-amber-800' :
                                      'bg-slate-100 text-slate-500'
                                    }`}>
                                      {isFull ? `Paid SLE ${paidSum.toLocaleString()} ✓` :
                                       isPartial ? `Partial SLE ${paidSum.toLocaleString()} / ${camp.expected_amount_per_member}` :
                                       `Pending SLE 0 / ${camp.expected_amount_per_member}`}
                                    </span>

                                    {!isFull && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          sendInAppNotification({
                                            department_name: activeDept,
                                            recipient_member_id: m.id,
                                            recipient_member_name: m.name,
                                            type: 'welfare_reminder',
                                            title: `🔔 Contribution Reminder: ${camp.title}`,
                                            message: `Friendly reminder for ${m.name}: Target contribution is SLE ${camp.expected_amount_per_member.toLocaleString()} towards ${camp.beneficiary_member_name}'s welfare drive. Deadline: ${camp.deadline}.`,
                                            campaign_id: camp.id,
                                            expected_amount: camp.expected_amount_per_member,
                                            deadline: camp.deadline,
                                            sent_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader'
                                          });
                                          setProposalSuccessToast(`🔔 Sent in-app reminder to ${m.name}`);
                                          setTimeout(() => setProposalSuccessToast(null), 3000);
                                        }}
                                        className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-lg text-[10px] border border-amber-200 cursor-pointer flex items-center gap-1"
                                        title="Send In-App Reminder to this member"
                                      >
                                        <Bell size={11} /> Remind
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setContribCampaignId(camp.id);
                                        setContribMemberId(m.id);
                                        setContribMemberName(m.name);
                                        setContribCategory('welfare');
                                        setContribWelfareReason(camp.reason);
                                        setContribAmount(camp.expected_amount_per_member - paidSum > 0 ? camp.expected_amount_per_member - paidSum : camp.expected_amount_per_member);
                                        setShowRecordContribModal(true);
                                      }}
                                      className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold rounded-lg text-[10px] border border-purple-200 cursor-pointer"
                                    >
                                      + Log
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: MONTHLY MEMBERSHIP DUES LEDGER */}
          {activeWelfareTab === 'monthly_dues' && (
            <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <Landmark size={18} className="text-emerald-600" />
                    Monthly Membership Dues Ledger
                  </h4>
                  <p className="text-xs text-slate-500">
                    Track regular monthly dues payments per billing cycle for all department members.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const pendingMembers = deptRoster.filter(m => {
                        const paidSum = memberContributions
                          .filter(c => c.category === 'monthly_dues' && (c.member_id === m.id || c.member_name.toLowerCase() === m.name.toLowerCase()))
                          .reduce((s, c) => s + Number(c.amount), 0);
                        return paidSum <= 0;
                      });
                      const count = sendMonthlyDuesReminderToPendingMembers(
                        activeDept,
                        pendingMembers,
                        'November 2026',
                        200,
                        profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader'
                      );
                      setProposalSuccessToast(`🔔 Sent in-app monthly dues reminder to ${count} pending member(s)!`);
                      setTimeout(() => setProposalSuccessToast(null), 4000);
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                    title="Send in-app dues reminder to all pending members"
                  >
                    <Bell size={13} /> Remind Pending
                  </button>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-500">Cycle:</span>
                    <select
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-xs outline-none cursor-pointer"
                      defaultValue="2026-11"
                    >
                      <option value="2026-11">November 2026</option>
                      <option value="2026-10">October 2026</option>
                      <option value="2026-09">September 2026</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {deptRoster.map(m => {
                  const duesContribs = memberContributions.filter(c => c.category === 'monthly_dues' && (c.member_id === m.id || c.member_name.toLowerCase() === m.name.toLowerCase()));
                  const totalPaid = duesContribs.reduce((s, c) => s + Number(c.amount), 0);
                  const isPaid = totalPaid > 0;

                  return (
                    <div key={m.id} className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                          {m.name[0]}
                        </div>
                        <div>
                          <h5 className="font-extrabold text-slate-900">{m.name}</h5>
                          <span className="text-[10px] text-slate-400">{m.role}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isPaid ? `Paid SLE ${totalPaid}` : 'Dues Pending'}
                          </span>
                        </div>

                        {!isPaid && (
                          <button
                            type="button"
                            onClick={() => {
                              sendInAppNotification({
                                department_name: activeDept,
                                recipient_member_id: m.id,
                                recipient_member_name: m.name,
                                type: 'dues_reminder',
                                title: `📅 Monthly Dues Reminder (November 2026)`,
                                message: `Friendly reminder for ${m.name}: Regular monthly membership dues of SLE 200 for November 2026 are currently due.`,
                                expected_amount: 200,
                                sent_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Ministry Leader'
                              });
                              setProposalSuccessToast(`🔔 Sent in-app monthly dues reminder to ${m.name}`);
                              setTimeout(() => setProposalSuccessToast(null), 3000);
                            }}
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl font-extrabold text-[11px] cursor-pointer"
                            title="Send In-App Dues Reminder"
                          >
                            <Bell size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setContribMemberId(m.id);
                            setContribMemberName(m.name);
                            setContribCategory('monthly_dues');
                            setContribMonthYear('2026-11');
                            setContribAmount(200);
                            setShowRecordContribModal(true);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-[11px] shadow-2xs cursor-pointer"
                        >
                          + Log Dues
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: MEMBER DIGITAL WELFARE PASSBOOK CARDS */}
          {activeWelfareTab === 'cards' && (
            <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <CreditCard size={18} className="text-indigo-600" />
                    Member Digital Welfare Cards ({deptRoster.length})
                  </h4>
                  <p className="text-xs text-slate-500">
                    Official welfare passbooks for all assigned ministry members.
                  </p>
                </div>

                <div className="relative max-w-xs w-full">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search member name or card #..."
                    value={welfareSearchQuery}
                    onChange={(e) => setWelfareSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deptRoster
                  .filter(m => !welfareSearchQuery.trim() || m.name.toLowerCase().includes(welfareSearchQuery.toLowerCase()))
                  .map(member => {
                    const card = getMemberWelfareCard(member.id, member.name, activeDept);
                    return (
                      <div key={member.id} className="p-4 bg-gradient-to-br from-slate-50 to-purple-50/30 rounded-2xl border border-slate-200 space-y-3 shadow-xs hover:border-purple-300 transition-all">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white font-black flex items-center justify-center text-sm shadow-xs">
                              {member.name ? member.name[0].toUpperCase() : 'M'}
                            </div>
                            <div>
                              <h4 className="font-extrabold text-slate-900 text-sm leading-tight">{member.name}</h4>
                              <p className="text-[10px] text-purple-700 font-bold mt-0.5">{card.card_number}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            card.status === 'Good Standing' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {card.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 p-2 bg-white rounded-xl border border-slate-200/80 text-[10px]">
                          <div>
                            <span className="text-slate-400 font-medium block">Welfare</span>
                            <strong className="font-mono text-purple-900">SLE {card.total_welfare_paid.toLocaleString()}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium block">Dues</span>
                            <strong className="font-mono text-emerald-900">SLE {card.total_dues_paid.toLocaleString()}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium block">Support</span>
                            <strong className="font-mono text-blue-900">SLE {card.total_support_paid.toLocaleString()}</strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openViewWelfareCard(member)}
                            className="flex-1 py-1.5 px-2 bg-white border border-purple-200 hover:bg-purple-50 text-purple-800 font-extrabold rounded-xl text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs"
                          >
                            <CreditCard size={13} /> View Passbook
                          </button>
                          <button
                            type="button"
                            onClick={() => openRecordContribForMember(member)}
                            className="py-1.5 px-3 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs"
                          >
                            <Plus size={13} /> Log
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* TAB 4: ALL ITEMIZED CONTRIBUTIONS LEDGER (MOBILE & TABLET RESPONSIVE) */}
          {activeWelfareTab === 'ledger' && (
            <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <ClipboardList size={18} className="text-purple-600" />
                    Itemized Member Contribution Ledger ({memberContributions.length})
                  </h4>
                  <p className="text-xs text-slate-500">
                    Complete breakdown of all member welfare gifts, monthly dues, and special support entries.
                  </p>
                </div>

                {/* Filter Switcher */}
                <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  {['all', 'welfare', 'monthly_dues', 'special_support'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setWelfareFilterCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-all capitalize ${
                        welfareFilterCategory === cat ? 'bg-white text-purple-900 shadow-xs font-black' : 'text-slate-600'
                      }`}
                    >
                      {cat === 'all' ? 'All Types' : cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {memberContributions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                  No member contribution records found for {activeDept}. Click "+ Log Member Contribution" to record welfare or monthly dues!
                </div>
              ) : (
                <>
                  {/* MOBILE & TABLET RESPONSIVE CARDS VIEW (visible on small/medium screens) */}
                  <div className="block md:hidden space-y-3">
                    {memberContributions
                      .filter(c => welfareFilterCategory === 'all' || c.category === welfareFilterCategory)
                      .map(contrib => (
                        <div key={contrib.id} className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-2 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h5 className="font-extrabold text-slate-900 text-sm">{contrib.member_name}</h5>
                              <span className="font-mono text-[10px] text-purple-700 font-bold block">{contrib.welfare_card_number || 'N/A'}</span>
                            </div>
                            <span className="font-mono font-black text-sm text-purple-900">
                              SLE {contrib.amount.toLocaleString()}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${getCategoryBadgeColor(contrib.category)}`}>
                              {contrib.category.replace('_', ' ')}
                            </span>
                            <span className="text-[11px] text-slate-700 font-medium">
                              {contrib.category === 'welfare' ? getWelfareReasonLabel(contrib.welfare_reason) :
                               contrib.category === 'monthly_dues' ? `Period: ${contrib.period_month_year || 'Current Month'}` :
                               contrib.special_support_purpose || 'Task Support'}
                            </span>
                          </div>

                          <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                            <span>{new Date(contrib.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} • {contrib.payment_method.toUpperCase()}</span>
                            <span>By: {contrib.recorded_by}</span>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* DESKTOP VIEW TABLE (hidden on mobile, visible on md+) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 bg-slate-50/50">
                          <th className="p-3">Date</th>
                          <th className="p-3">Member Name</th>
                          <th className="p-3">Welfare Card #</th>
                          <th className="p-3">Category & Reason</th>
                          <th className="p-3">Method & Ref</th>
                          <th className="p-3 text-right">Amount (SLE)</th>
                          <th className="p-3">Recorded By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {memberContributions
                          .filter(c => welfareFilterCategory === 'all' || c.category === welfareFilterCategory)
                          .map(contrib => (
                            <tr key={contrib.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3 font-mono text-[11px] text-slate-500">
                                {new Date(contrib.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                              </td>
                              <td className="p-3 font-bold text-slate-900">
                                {contrib.member_name}
                              </td>
                              <td className="p-3 font-mono text-[11px] text-purple-700 font-bold">
                                {contrib.welfare_card_number || 'N/A'}
                              </td>
                              <td className="p-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${getCategoryBadgeColor(contrib.category)}`}>
                                  {contrib.category.replace('_', ' ')}
                                </span>
                                <div className="text-[11px] text-slate-700 font-medium mt-0.5">
                                  {contrib.category === 'welfare' ? getWelfareReasonLabel(contrib.welfare_reason) :
                                   contrib.category === 'monthly_dues' ? `Period: ${contrib.period_month_year || 'Current Month'}` :
                                   contrib.special_support_purpose || 'Task Support'}
                                </div>
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-600">
                                <span className="uppercase font-bold">{contrib.payment_method}</span>
                                {contrib.transaction_ref && <span className="text-slate-400 block text-[10px]">Ref: {contrib.transaction_ref}</span>}
                              </td>
                              <td className="p-3 text-right font-mono font-black text-sm text-purple-900">
                                SLE {contrib.amount.toLocaleString()}
                              </td>
                              <td className="p-3 text-slate-500 text-[11px]">
                                {contrib.recorded_by}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* --- PROPOSAL CREATOR & EDITOR MODAL --- */}
      {showProposalModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full shadow-2xl border border-slate-200 space-y-6 my-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                    {editingReqNum ? `Edit Proposal: ${editingReqNum}` : 'Draft New Proposal'}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">• {reqDept}</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {editingReqNum ? 'Modify Procurement Proposal' : 'Draft Equipment Funding Proposal'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Build your itemized proposal invoice. You can save as a draft to edit later or submit directly to pastoral board.
                </p>
              </div>
              <button onClick={() => setShowProposalModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X size={22} />
              </button>
            </div>

            <form onSubmit={e => { e.preventDefault(); handleSaveFundingProposal(false); }} className="space-y-6 text-xs">
              {/* SECTION 1: PROPOSAL ESSENTIALS */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
                <div className="flex items-center gap-2 font-black text-slate-900 text-sm">
                  <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs">1</span>
                  <span>Proposal Essentials & Target Ministry</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Target Department *</label>
                    <select
                      value={reqDept}
                      onChange={e => setReqDept(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold cursor-pointer"
                    >
                      <option value="Media & IT Ministry">Media & IT Ministry</option>
                      <option value="Voices of Grace Choir">Voices of Grace Choir</option>
                      <option value="Kingdom Youth Ministry">Kingdom Youth Ministry</option>
                      <option value="Children Ministry">Children Ministry</option>
                      <option value="Outreach & Evangelism">Outreach & Evangelism</option>
                      <option value="Ushers & Hospitality">Ushers & Hospitality</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Applicant Leader Name *</label>
                    <input
                      type="text"
                      required
                      value={reqApplicantName}
                      onChange={e => setReqApplicantName(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Priority Level</label>
                    <select
                      value={reqPriority}
                      onChange={e => setReqPriority(e.target.value as any)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold cursor-pointer"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent Priority</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Proposal Title & Equipment Objective *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Purchase 2x Sony Cinema Cameras & High-Speed SDI Cables"
                    value={reqTitle}
                    onChange={e => setReqTitle(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Justification & Ministry Purpose</label>
                  <textarea
                    rows={2}
                    placeholder="Describe how this equipment supports Sunday services or ministry operations..."
                    value={reqDesc}
                    onChange={e => setReqDesc(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              {/* SECTION 2: ITEMIZED PRICE QUOTATION BUILDER */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3.5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-200/80">
                  <div className="flex items-center gap-2 font-black text-slate-900 text-sm">
                    <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs shadow-xs">2</span>
                    <span>Itemized Price Quotation Breakdown</span>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={handleAddReqItemRow}
                      className="text-xs font-extrabold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-xs hover:border-indigo-300 transition-all"
                    >
                      <Plus size={14} /> Add Line Item
                    </button>
                  </div>
                </div>

                {/* Quick Presets Bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                  <span className="font-extrabold text-slate-400 shrink-0 text-[10px] uppercase tracking-wider">Quick Presets:</span>
                  {[
                    { name: 'SDI High-Speed Video Cable (10m)', price: 450, qty: 2 },
                    { name: 'Wireless UHF Lapel Microphone Kit', price: 1850, qty: 1 },
                    { name: 'Heavy-Duty Aluminum Camera Tripod', price: 1200, qty: 1 },
                    { name: 'Studio LED Stage Light Panel 60W', price: 2500, qty: 2 },
                    { name: 'Power Extension Reel & Surge Strip', price: 350, qty: 2 }
                  ].map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => {
                        const newItems = [...reqItems, { item_name: preset.name, quantity: preset.qty, unit_price: preset.price }];
                        setReqItems(newItems);
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 rounded-lg border border-slate-200 font-semibold cursor-pointer shrink-0 transition-colors"
                    >
                      + {preset.name} (SLE {preset.price.toLocaleString()})
                    </button>
                  ))}
                </div>

                {/* Itemized Table Header */}
                <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 bg-slate-200/70 rounded-xl font-extrabold text-[11px] text-slate-700 uppercase tracking-wider">
                  <div className="col-span-5">Item Description & Specification</div>
                  <div className="col-span-2 text-center">Quantity</div>
                  <div className="col-span-2 text-right">Unit Price (SLE)</div>
                  <div className="col-span-2 text-right">Line Subtotal</div>
                  <div className="col-span-1 text-center">Action</div>
                </div>

                {/* Itemized Rows */}
                <div className="space-y-2">
                  {reqItems.map((item, idx) => {
                    const lineSubtotal = (Number(item.quantity || 1) * Number(item.unit_price || 0));
                    return (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2 sm:space-y-0 transition-all hover:border-slate-300">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                          {/* Item Name */}
                          <div className="sm:col-span-5">
                            <label className="sm:hidden text-[10px] font-bold text-slate-400 block mb-0.5">Item Specification</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Sony FX3 Cinema Camera Body or SDI Cable"
                              value={item.item_name}
                              onChange={e => handleUpdateReqItemRow(idx, 'item_name', e.target.value)}
                              className="w-full p-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>

                          {/* Quantity */}
                          <div className="sm:col-span-2">
                            <label className="sm:hidden text-[10px] font-bold text-slate-400 block mb-0.5">Quantity</label>
                            <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateReqItemRow(idx, 'quantity', Math.max(1, Number(item.quantity || 1) - 1))}
                                className="w-6 h-6 rounded flex items-center justify-center font-black text-slate-600 hover:bg-slate-200 cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={1}
                                required
                                value={item.quantity}
                                onChange={e => handleUpdateReqItemRow(idx, 'quantity', e.target.value)}
                                className="w-12 text-center bg-transparent text-xs font-black text-slate-900 font-mono focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateReqItemRow(idx, 'quantity', Number(item.quantity || 1) + 1)}
                                className="w-6 h-6 rounded flex items-center justify-center font-black text-slate-600 hover:bg-slate-200 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Unit Price */}
                          <div className="sm:col-span-2">
                            <label className="sm:hidden text-[10px] font-bold text-slate-400 block mb-0.5">Unit Price (SLE)</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-[10px] font-bold text-slate-400 font-mono">SLE</span>
                              <input
                                type="number"
                                min={0}
                                required
                                placeholder="0.00"
                                value={item.unit_price}
                                onChange={e => handleUpdateReqItemRow(idx, 'unit_price', e.target.value)}
                                className="w-full pl-9 pr-2 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-xs font-black font-mono text-slate-900 text-right focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>
                          </div>

                          {/* Line Total */}
                          <div className="sm:col-span-2 text-right">
                            <label className="sm:hidden text-[10px] font-bold text-slate-400 block mb-0.5">Line Total</label>
                            <div className="py-2 px-2.5 bg-indigo-50/70 border border-indigo-100 rounded-lg font-black text-indigo-900 font-mono text-xs text-right">
                              SLE {lineSubtotal.toLocaleString()}
                            </div>
                          </div>

                          {/* Action */}
                          <div className="sm:col-span-1 flex justify-center">
                            {reqItems.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveReqItemRow(idx)}
                                className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                title="Remove line item"
                              >
                                <X size={16} />
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300 font-mono">1 item min</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Calculation Summary Footer Bar */}
                <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-indigo-900 text-white p-3.5 rounded-xl shadow-md">
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-indigo-300 block text-[10px] uppercase font-bold tracking-wider">Line Items</span>
                      <span className="font-black font-mono text-sm">{reqItems.length} items</span>
                    </div>
                    <div className="h-6 w-px bg-indigo-700"></div>
                    <div>
                      <span className="text-indigo-300 block text-[10px] uppercase font-bold tracking-wider">Total Quantity</span>
                      <span className="font-black font-mono text-sm">
                        {reqItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0)} units
                      </span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right w-full sm:w-auto border-t sm:border-t-0 border-indigo-800 pt-2 sm:pt-0">
                    <span className="text-indigo-300 block text-[10px] uppercase font-extrabold tracking-wider">Calculated Total Requested Budget</span>
                    <span className="text-emerald-400 font-mono font-black text-xl tracking-tight">
                      SLE {reqItems.reduce((sum, item) => sum + (Number(item.quantity || 1) * Number(item.unit_price || 0)), 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: DISBURSEMENT DETAILS */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-2 font-black text-slate-900 text-sm">
                  <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs">3</span>
                  <span>Disbursement Preference & Vendor Quotes</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Preferred Payment Channel</label>
                    <select
                      value={reqDisbMethod}
                      onChange={e => setReqDisbMethod(e.target.value as any)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold cursor-pointer"
                    >
                      <option value="bank_transfer">Direct Vendor Bank Wire</option>
                      <option value="mobile_money">Mobile Money Transfer</option>
                      <option value="cash">Petty Cash Voucher</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Vendor Proforma Ref / Link</label>
                    <input
                      type="text"
                      placeholder="e.g. Proforma #TECH-SL-9912"
                      value={reqVendorQuote}
                      onChange={e => setReqVendorQuote(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: FORM ACTIONS BAR */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    const formattedItems: RequisitionItem[] = reqItems.map((item, idx) => ({
                      id: `item-${Date.now()}-${idx}`,
                      item_name: item.item_name || 'Equipment Item',
                      quantity: Number(item.quantity) || 1,
                      unit_price: Number(item.unit_price) || 0,
                      total_price: (Number(item.quantity) || 1) * (Number(item.unit_price) || 0)
                    }));
                    const totalReqAmount = formattedItems.reduce((sum, item) => sum + item.total_price, 0);

                    const draftReq: DepartmentRequisition = {
                      id: editingReqId || `req-${Date.now()}`,
                      requisition_number: editingReqNum || `REQ-2026-00${requisitions.length + 1}`,
                      department_name: reqDept,
                      applicant_name: reqApplicantName.trim() || `${profile?.first_name} ${profile?.last_name}`,
                      applicant_role: reqApplicantRole.trim() || 'Ministry Leader',
                      title: reqTitle.trim() || 'Equipment Procurement Request',
                      description: reqDesc.trim(),
                      requested_amount: totalReqAmount > 0 ? totalReqAmount : 5000,
                      currency: 'SLE',
                      priority: reqPriority,
                      status: 'draft',
                      created_at: new Date().toISOString(),
                      needed_by_date: reqNeededDate || new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
                      vendor_quote_url: reqVendorQuote.trim() || undefined,
                      disbursement_method: reqDisbMethod,
                      disbursement_account_info: reqDisbInfo.trim() || undefined,
                      items: formattedItems
                    };

                    setPreviewProposal(draftReq);
                    setShowProposalPreviewModal(true);
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-indigo-200"
                >
                  <Eye size={15} /> Preview Invoice
                </button>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setShowProposalModal(false)}
                    className="px-4 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveFundingProposal(true)}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Clock size={15} /> Save as Draft
                  </button>

                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md shadow-indigo-100 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send size={15} /> Submit Proposal
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EXPENDITURE RECONCILIATION & RECEIPT UPLOAD MODAL --- */}
      {reconcileReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-100 text-teal-800">
                  Post-Disbursement Audit Governance
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">Expenditure Report & Receipt Upload</h3>
              </div>
              <button onClick={() => setReconcileReq(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            {/* Explanatory Banner: What is Reconcile Spending? */}
            <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-2xl text-xs space-y-1 text-indigo-950">
              <div className="font-extrabold flex items-center gap-1.5 text-indigo-900">
                <AlertCircle size={15} className="text-indigo-600 shrink-0" />
                What is Reconcile Spending & Upload Receipt?
              </div>
              <p className="text-[11px] leading-relaxed text-indigo-900/80">
                This is the post-disbursement audit step in church financial governance. After Finance disburses budget to your department, you spend it with vendors and then upload/scan the physical tax receipt proof here. You also report the actual amount spent and return any unspent balance to treasury. Completing this keeps your ministry in <strong>Good Standing</strong> for future funding!
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Proposal ID:</span>
                <strong className="text-indigo-600 font-mono">{reconcileReq.requisition_number}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Department:</span>
                <strong className="text-slate-800">{reconcileReq.department_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Title:</span>
                <span className="font-bold text-slate-900">{reconcileReq.title}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-400">Disbursed Amount:</span>
                <strong className="text-emerald-700 font-black text-sm">SLE {reconcileReq.requested_amount.toLocaleString()}</strong>
              </div>
            </div>

            <form onSubmit={handleConfirmReconciliation} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Actual Amount Spent (SLE) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={actualSpentInput}
                    onChange={e => setActualSpentInput(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Unspent Returned (SLE)</label>
                  <input
                    type="number"
                    readOnly
                    value={Math.max(0, reconcileReq.requested_amount - (Number(actualSpentInput) || 0))}
                    className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold font-mono text-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Vendor Tax Receipt Proof Ref / File Name *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Freetown_TechZone_Tax_Receipt_Signed.pdf"
                    value={receiptProofInput}
                    onChange={e => setReceiptProofInput(e.target.value)}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-indigo-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setScannerContext('reconciliation');
                      setShowDocumentScanner(true);
                    }}
                    className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                  >
                    <Camera size={14} /> Scan Photo
                  </button>
                </div>
              </div>

              {scannedReceiptUrl && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" /> Scanned Receipt Photo Attached
                  </span>
                  <button
                    type="button"
                    onClick={() => setInspectingReceiptUrl(scannedReceiptUrl)}
                    className="text-indigo-600 hover:text-indigo-800 font-bold text-[11px] underline"
                  >
                    Preview
                  </button>
                </div>
              )}

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Itemized Spending Report & Explanations *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Summarize how the funds were disbursed, vendor invoice details, and item condition..."
                  value={receiptNotesInput}
                  onChange={e => setReceiptNotesInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setReconcileReq(null)} className="px-4 py-2 text-slate-500 font-bold">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-black rounded-xl shadow-md cursor-pointer flex items-center gap-1.5">
                  <CheckCircle2 size={16} /> Submit Receipt & Reconcile Spending
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- RECORD DEPARTMENT LEDGER ENTRY MODAL --- */}
      {showDeptRecordModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  deptRecordType === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {activeDept} Treasury
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  Record Department {deptRecordType === 'income' ? 'Income' : 'Expense'}
                </h3>
              </div>
              <button onClick={() => setShowDeptRecordModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveDeptRecord} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setDeptRecordType('income');
                    setDeptRecordCategory('Ministry Offering & Grants');
                  }}
                  className={`py-2 rounded-lg font-black transition-all cursor-pointer ${
                    deptRecordType === 'income' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  + Income Entry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeptRecordType('expense');
                    setDeptRecordCategory('Equipment Maintenance & Supplies');
                  }}
                  className={`py-2 rounded-lg font-black transition-all cursor-pointer ${
                    deptRecordType === 'expense' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  - Expense Entry
                </button>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Category *</label>
                <select
                  value={deptRecordCategory}
                  onChange={e => setDeptRecordCategory(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  {deptRecordType === 'income' ? (
                    <>
                      <option value="Ministry Offering & Grants">Ministry Offering & Grants</option>
                      <option value="Event Registration Collections">Event Registration Collections</option>
                      <option value="Special Ministry Sponsorship">Special Ministry Sponsorship</option>
                      <option value="Internal Department Allocation">Internal Department Allocation</option>
                    </>
                  ) : (
                    <>
                      <option value="Equipment Maintenance & Supplies">Equipment Maintenance & Supplies</option>
                      <option value="Event Refreshments & Catering">Event Refreshments & Catering</option>
                      <option value="Logistics & Transportation">Logistics & Transportation</option>
                      <option value="Software Subscriptions & Cloud Media">Software Subscriptions & Cloud Media</option>
                      <option value="Honorarium & Guest Speakers">Honorarium & Guest Speakers</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Description / Purpose *</label>
                <input
                  type="text"
                  required
                  placeholder={deptRecordType === 'income' ? 'e.g. Sunday Service Youth Offering Collection' : 'e.g. Replacement SDI cables and tripod mounting plates'}
                  value={deptRecordDesc}
                  onChange={e => setDeptRecordDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Amount (SLE) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="0.00"
                    value={deptRecordAmount}
                    onChange={e => setDeptRecordAmount(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Vendor / Payer</label>
                  <input
                    type="text"
                    placeholder={deptRecordType === 'income' ? 'e.g. Congregation' : 'e.g. Freetown TechZone'}
                    value={deptRecordVendor}
                    onChange={e => setDeptRecordVendor(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Payment Method</label>
                  <select
                    value={deptRecordMethod}
                    onChange={e => setDeptRecordMethod(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                  >
                    <option value="cash">Petty Cash</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="bank_transfer">Bank Wire</option>
                  </select>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Receipt Attachment</label>
                  <button
                    type="button"
                    onClick={() => {
                      setScannerContext('ledger');
                      setShowDocumentScanner(true);
                    }}
                    className="w-full p-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-bold hover:bg-indigo-100 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera size={14} /> {scannedReceiptUrl ? 'Receipt Attached ✓' : 'Scan Receipt'}
                  </button>
                </div>
              </div>

              {scannedReceiptUrl && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-[11px]">
                  <span className="font-bold text-emerald-800">Scanned Receipt Proof Attached</span>
                  <button type="button" onClick={() => setScannedReceiptUrl(null)} className="text-emerald-700 hover:text-emerald-900">
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowDeptRecordModal(false)} className="px-4 py-2 text-slate-500 font-bold">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md cursor-pointer">
                  Save Ledger Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DOCUMENT SCANNER UI MODAL --- */}
      {showDocumentScanner && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-[110] flex items-center justify-center p-4 overflow-y-auto">
          <ReceiptDocumentScanner
            initialImage={scannedReceiptUrl || undefined}
            onCaptureReceipt={(imgUrl, detectedVendor, detectedAmount) => {
              setScannedReceiptUrl(imgUrl);
              setShowDocumentScanner(false);
              if (scannerContext === 'ledger' && showDeptRecordModal) {
                if (detectedVendor && !deptRecordVendor) setDeptRecordVendor(detectedVendor);
                if (detectedAmount && !deptRecordAmount) setDeptRecordAmount(String(detectedAmount));
              } else if (scannerContext === 'reconciliation' && reconcileReq) {
                if (detectedAmount && !actualSpentInput) setActualSpentInput(String(detectedAmount));
              }
            }}
            onCancel={() => setShowDocumentScanner(false)}
          />
        </div>
      )}

      {/* --- FULL RESOLUTION RECEIPT PROOF INSPECTOR MODAL --- */}
      {inspectingReceiptUrl && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-4 max-w-xl w-full space-y-3 shadow-2xl">
            <div className="flex justify-between items-center text-white pb-2 border-b border-slate-800">
              <span className="text-xs font-black uppercase text-indigo-400 flex items-center gap-1.5">
                <Eye size={14} /> Scanned Receipt Proof Inspector
              </span>
              <button onClick={() => setInspectingReceiptUrl(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="bg-slate-950 p-2 rounded-2xl flex items-center justify-center max-h-[70vh] overflow-auto">
              <img src={inspectingReceiptUrl} alt="Receipt Proof" className="max-w-full max-h-[65vh] object-contain rounded-xl bg-white" />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingReceiptUrl(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- INCOME & EXPENSE REPORT GENERATOR MODAL --- */}
      {showReportGeneratorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                  Income & Expense Module Reports
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">Generate Financial Operations Report</h3>
              </div>
              <button onClick={() => setShowReportGeneratorModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 leading-relaxed">
              Generate official financial audit statements and itemized transaction sheets derived exclusively from the <strong className="text-slate-900">{activeDept}</strong> Income & Expense Treasury Ledger.
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1.5">1. Select Report Scope *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReportFilterType('all')}
                    className={`p-3 rounded-xl border text-center font-extrabold transition-all cursor-pointer ${
                      reportFilterType === 'all'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Combined (Income & Expense)
                  </button>

                  <button
                    type="button"
                    onClick={() => setReportFilterType('income')}
                    className={`p-3 rounded-xl border text-center font-extrabold transition-all cursor-pointer ${
                      reportFilterType === 'income'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Income & Offerings Only
                  </button>

                  <button
                    type="button"
                    onClick={() => setReportFilterType('expense')}
                    className={`p-3 rounded-xl border text-center font-extrabold transition-all cursor-pointer ${
                      reportFilterType === 'expense'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Expenses & Spending Only
                  </button>
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1.5">2. Select Accounting Timeframe *</label>
                <select
                  value={reportDateRange}
                  onChange={e => setReportDateRange(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  <option value="all">All-Time Cumulative Ledger Records</option>
                  <option value="this_month">Current Month (30-Day Activity)</option>
                  <option value="this_quarter">Current Financial Quarter</option>
                  <option value="this_year">Current Fiscal Year (2026)</option>
                </select>
              </div>

              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-slate-900 block">Report Target Ministry:</span>
                  <span className="text-indigo-700 font-extrabold">{activeDept}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-semibold block">Source Ledger:</span>
                  <span className="text-xs font-mono font-black text-emerald-700">Income & Expense Module</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    handleGenerateDeptFinancialPDFReport(activeDept, reportFilterType, reportDateRange);
                    setShowReportGeneratorModal(false);
                  }}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Printer size={15} /> Print / Download PDF Report
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowReportGeneratorModal(false);
                    setProposalSuccessToast(`Official ${reportFilterType.toUpperCase()} Financial Report for ${activeDept} submitted to Finance Officer Sahr Sesay & Pastoral Board for formal review!`);
                    setTimeout(() => setProposalSuccessToast(null), 6000);
                  }}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Send size={15} /> Submit Report to Finance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- PROPOSAL & PROFORMA INVOICE PREVIEW / EDIT MODAL --- */}
      {showProposalPreviewModal && previewProposal && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-100 rounded-3xl p-4 sm:p-6 max-w-4xl w-full shadow-2xl border border-slate-300 space-y-4 my-auto">
            {/* Top Modal Navigation & View Mode Switcher */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-300">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-900">
                  Official Church Financial Document
                </span>
                <h3 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
                  Proforma Invoice & Funding Requisition
                </h3>
              </div>

              {/* View Selector Tabs */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-300 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('invoice')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      previewTab === 'invoice'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Eye size={14} /> Invoice View
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewTab('edit')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      previewTab === 'edit'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Plus size={14} /> Edit Invoice Data
                  </button>
                </div>

                <button
                  onClick={() => setShowProposalPreviewModal(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-1.5 rounded-lg hover:bg-slate-200"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* TAB 1: AUTHENTIC INVOICE DOCUMENT DESIGN */}
            {previewTab === 'invoice' && (
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-300 shadow-lg space-y-6 text-slate-900 font-sans relative overflow-hidden">
                {/* Watermark Status Stamp */}
                <div className="absolute top-6 right-6 opacity-15 pointer-events-none transform rotate-[-12deg] select-none text-right">
                  <div className="text-4xl sm:text-5xl font-black uppercase tracking-widest text-indigo-900 border-4 border-indigo-900 p-2 rounded-xl">
                    {previewProposal.status === 'draft' ? 'DRAFT' : previewProposal.status.replace(/_/g, ' ')}
                  </div>
                </div>

                {/* Invoice Document Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b-2 border-indigo-950">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-indigo-900 text-white font-black flex items-center justify-center text-sm shadow-xs">
                        GC
                      </div>
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-wider text-indigo-950">
                          Grace Cathedral International
                        </h2>
                        <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
                          Office of General Treasury & Procurement
                        </span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-950">
                        Proforma Invoice & Purchase Requisition
                      </h1>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Official document for ministry equipment acquisition & budget allocation.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-right w-full sm:w-auto font-mono text-xs space-y-1 shrink-0">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Invoice No.</span>
                      <strong className="text-indigo-900 text-sm font-black">{previewProposal.requisition_number}</strong>
                    </div>
                    <div className="pt-1 border-t border-slate-200">
                      <span className="text-slate-500">Date Issued:</span>{' '}
                      <strong className="text-slate-800">{new Date(previewProposal.created_at).toLocaleDateString()}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Needed By:</span>{' '}
                      <strong className="text-amber-700">{previewProposal.needed_by_date || 'Within 14 Days'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Priority:</span>{' '}
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-black text-[10px] uppercase">
                        {previewProposal.priority}
                      </span>
                    </div>
                  </div>
                </div>

                {/* From / To Entities Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">
                      ISSUED BY (REQUESTING MINISTRY):
                    </span>
                    <h3 className="font-black text-slate-900 text-sm">{previewProposal.department_name}</h3>
                    <p className="text-slate-600 font-semibold">
                      Leader: <strong>{previewProposal.applicant_name}</strong> ({previewProposal.applicant_role || 'Ministry Lead'})
                    </p>
                    <p className="text-slate-400 text-[11px]">Grace Cathedral Main Campus • Freetown, Sierra Leone</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                      BILLED TO (TREASURY & APPROVAL BODY):
                    </span>
                    <h3 className="font-black text-slate-900 text-sm">Board of Senior Pastors & Finance Secretariat</h3>
                    <p className="text-slate-600 font-semibold">
                      Attention: <strong>Senior Pastor Board & Finance Officer Sahr Sesay</strong>
                    </p>
                    <p className="text-slate-400 text-[11px]">Channel: {previewProposal.disbursement_method?.replace(/_/g, ' ').toUpperCase() || 'Bank Wire'}</p>
                  </div>
                </div>

                {/* Subject & Purpose */}
                <div className="p-3.5 bg-indigo-50/60 rounded-2xl border border-indigo-100 text-xs space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800 block">
                    PROPOSAL SUBJECT & EXECUTIVE PURPOSE:
                  </span>
                  <div className="font-black text-slate-900 text-sm">{previewProposal.title}</div>
                  <p className="text-slate-600 leading-relaxed italic">{previewProposal.description || 'No detailed justification provided.'}</p>
                </div>

                {/* Itemized Purchase Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Itemized Procurement Breakdown
                  </h4>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white font-extrabold text-[11px] uppercase tracking-wider">
                          <th className="py-2.5 px-3 text-center w-10">#</th>
                          <th className="py-2.5 px-4">Item Description & Specifications</th>
                          <th className="py-2.5 px-3 text-center w-16">Qty</th>
                          <th className="py-2.5 px-4 text-right">Unit Price (SLE)</th>
                          <th className="py-2.5 px-4 text-right">Line Subtotal (SLE)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {previewProposal.items.map((item, idx) => {
                          const lineTotal = (Number(item.quantity || 1) * Number(item.unit_price || 0));
                          return (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                              <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                              <td className="py-3 px-4 font-bold text-slate-900">{item.item_name}</td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">{item.quantity}</td>
                              <td className="py-3 px-4 text-right font-mono text-slate-700">{item.unit_price.toLocaleString()}</td>
                              <td className="py-3 px-4 text-right font-mono font-black text-indigo-950">
                                {lineTotal.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Invoice Totals & Summary Block */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-2">
                  <div className="w-full sm:w-1/2 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
                    <span className="font-extrabold text-slate-700 block">Payment & Account Instructions</span>
                    <p className="text-[11px] text-slate-500">
                      Disbursement Method:{' '}
                      <strong className="text-slate-800">{previewProposal.disbursement_method?.replace(/_/g, ' ').toUpperCase()}</strong>
                    </p>
                    {previewProposal.vendor_quote_url && (
                      <p className="text-[11px] text-slate-500">
                        Vendor Quote Ref: <strong className="text-indigo-700 font-mono">{previewProposal.vendor_quote_url}</strong>
                      </p>
                    )}
                    {previewProposal.disbursement_account_info && (
                      <p className="text-[11px] text-slate-500">
                        Account Details: <span className="font-mono">{previewProposal.disbursement_account_info}</span>
                      </p>
                    )}
                  </div>

                  <div className="w-full sm:w-1/2 bg-slate-900 text-white p-4 rounded-2xl space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-slate-300">
                      <span>Items Subtotal:</span>
                      <span>
                        SLE {previewProposal.items.reduce((s, i) => s + (Number(i.quantity || 1) * Number(i.unit_price || 0)), 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Tax / Import Duty (0% Exempt):</span>
                      <span>SLE 0.00</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700 flex justify-between items-center text-sm font-black">
                      <span className="text-amber-400 uppercase font-sans">Total Requested Budget:</span>
                      <span className="text-emerald-400 text-lg">
                        SLE {previewProposal.items.reduce((s, i) => s + (Number(i.quantity || 1) * Number(i.unit_price || 0)), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Official Signature Lines */}
                <div className="pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-xs">
                  <div className="space-y-2">
                    <div className="h-10 border-b border-slate-400 flex items-end justify-center pb-1">
                      <span className="font-serif italic font-bold text-indigo-900 text-sm">{previewProposal.applicant_name}</span>
                    </div>
                    <div>
                      <strong className="block text-slate-900">{previewProposal.applicant_name}</strong>
                      <span className="text-[10px] text-slate-400 block font-semibold">Department Leader Signatory</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="h-10 border-b border-slate-300 flex items-end justify-center pb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {previewProposal.status === 'draft' ? '[ Pending Pastoral Review ]' : 'Pastor Approved ✓'}
                      </span>
                    </div>
                    <div>
                      <strong className="block text-slate-900">Senior Pastor Board</strong>
                      <span className="text-[10px] text-slate-400 block font-semibold">Ecclesiastical Approval</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="h-10 border-b border-slate-300 flex items-end justify-center pb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {['disbursed', 'reconciled', 'settled'].includes(previewProposal.status) ? 'Disbursed ✓' : '[ Pending Treasury Wire ]'}
                      </span>
                    </div>
                    <div>
                      <strong className="block text-slate-900">Finance Officer Sahr Sesay</strong>
                      <span className="text-[10px] text-slate-400 block font-semibold">Disbursement & Audit</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: INTERACTIVE EDIT PROPOSAL DATA */}
            {previewTab === 'edit' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-300 shadow-sm space-y-4 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <h4 className="font-black text-slate-900 text-sm">Edit Invoice Metadata & Items</h4>
                  <span className="text-[11px] text-indigo-600 font-bold">Changes update invoice preview immediately</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Proposal Title *</label>
                    <input
                      type="text"
                      value={previewProposal.title}
                      onChange={e => setPreviewProposal({ ...previewProposal, title: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Priority Level</label>
                    <select
                      value={previewProposal.priority}
                      onChange={e => setPreviewProposal({ ...previewProposal, priority: e.target.value as any })}
                      className="w-full p-2.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl font-bold cursor-pointer"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent Priority</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Justification & Context</label>
                  <textarea
                    rows={2}
                    value={previewProposal.description}
                    onChange={e => setPreviewProposal({ ...previewProposal, description: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl"
                  />
                </div>

                {/* Editable Items */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center pb-1">
                    <span className="font-extrabold text-slate-800 text-xs">Itemized Invoice Items</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = [
                          ...previewProposal.items,
                          { id: `item-${Date.now()}`, item_name: 'New Equipment Spec', quantity: 1, unit_price: 500, total_price: 500 }
                        ];
                        setPreviewProposal({ ...previewProposal, items: newItems });
                      }}
                      className="text-xs font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={14} /> Add Line Item
                    </button>
                  </div>

                  <div className="space-y-2">
                    {previewProposal.items.map((item, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                        <input
                          type="text"
                          value={item.item_name}
                          onChange={e => {
                            const newItems = [...previewProposal.items];
                            newItems[idx].item_name = e.target.value;
                            setPreviewProposal({ ...previewProposal, items: newItems });
                          }}
                          className="flex-1 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                        />
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={e => {
                              const newItems = [...previewProposal.items];
                              const qty = Number(e.target.value) || 1;
                              newItems[idx].quantity = qty;
                              newItems[idx].total_price = qty * (newItems[idx].unit_price || 0);
                              setPreviewProposal({ ...previewProposal, items: newItems });
                            }}
                            className="w-16 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-center font-bold"
                          />
                          <input
                            type="number"
                            min={0}
                            value={item.unit_price}
                            onChange={e => {
                              const newItems = [...previewProposal.items];
                              const price = Number(e.target.value) || 0;
                              newItems[idx].unit_price = price;
                              newItems[idx].total_price = (newItems[idx].quantity || 1) * price;
                              setPreviewProposal({ ...previewProposal, items: newItems });
                            }}
                            className="w-28 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono text-right"
                          />
                          <span className="text-xs font-black text-indigo-700 w-24 text-right font-mono">
                            SLE {(Number(item.quantity || 1) * Number(item.unit_price || 0)).toLocaleString()}
                          </span>
                          {previewProposal.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newItems = previewProposal.items.filter((_, i) => i !== idx);
                                setPreviewProposal({ ...previewProposal, items: newItems });
                              }}
                              className="text-rose-500 p-1 cursor-pointer"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center font-black">
                    <span className="text-slate-700">Calculated Proposal Total:</span>
                    <span className="text-indigo-700 font-mono text-sm">
                      SLE {previewProposal.items.reduce((s, i) => s + (Number(i.quantity || 1) * Number(i.unit_price || 0)), 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Actions Footer Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-slate-300">
              <button
                type="button"
                onClick={() => handlePrintProformaInvoicePDF(previewProposal)}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer size={15} /> Print / Download PDF Invoice
              </button>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowProposalPreviewModal(false)}
                  className="px-4 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const draft: DepartmentRequisition = { ...previewProposal, status: 'draft' };
                    handleSaveAndSubmitEditedProposal(draft);
                    setShowProposalPreviewModal(false);
                    setProposalSuccessToast(`Proposal ${draft.requisition_number} updated and saved as Draft.`);
                    setTimeout(() => setProposalSuccessToast(null), 5000);
                  }}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Clock size={15} /> Save as Draft
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const submitted: DepartmentRequisition = { ...previewProposal, status: 'pending_pastor_approval' };
                    handleSaveAndSubmitEditedProposal(submitted);
                    setShowProposalPreviewModal(false);
                  }}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md shadow-indigo-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={15} /> Submit for Pastoral Approval
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- VIEW ROSTER MEMBER MODAL --- */}
      {viewingRosterMember && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-md">
                  {viewingRosterMember.name ? viewingRosterMember.name[0].toUpperCase() : 'M'}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">{viewingRosterMember.name}</h3>
                  <span className="text-xs text-indigo-700 font-bold">{viewingRosterMember.role}</span>
                </div>
              </div>
              <button onClick={() => setViewingRosterMember(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Department & Role Title</span>
                <div className="font-extrabold text-slate-900">{activeDept} • {viewingRosterMember.role}</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Assigned Service / Sunday Duty</span>
                <div className="font-bold text-indigo-700">{viewingRosterMember.duty}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Current Status</span>
                  <div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      viewingRosterMember.status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                      viewingRosterMember.status === 'On Leave' ? 'bg-amber-100 text-amber-800' :
                      'bg-indigo-100 text-indigo-800'
                    }`}>
                      {viewingRosterMember.status}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Appointed Since</span>
                  <div className="font-bold text-slate-700">{viewingRosterMember.joined_date || '2023-01-15'}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Contact Information</span>
                <div className="space-y-1 text-slate-700 font-medium">
                  <div>📧 {viewingRosterMember.email || 'No email registered'}</div>
                  <div>📞 {viewingRosterMember.phone || 'No phone registered'}</div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const m = viewingRosterMember;
                  setViewingRosterMember(null);
                  openEditRosterMember(m);
                }}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Edit size={14} /> Edit Role & Duty
              </button>

              <button
                type="button"
                onClick={() => setViewingRosterMember(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT ROSTER MEMBER MODAL --- */}
      {editingRosterMember && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900">
                  Edit Appointed Roster Role
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1">Modify Role Title & Duty</h3>
                <p className="text-xs text-slate-500">Update appointed title and service responsibilities for {activeDept}.</p>
              </div>
              <button onClick={() => setEditingRosterMember(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRosterEdit} className="space-y-4 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Member Full Name *</label>
                <input
                  type="text"
                  required
                  value={editRosterName}
                  onChange={e => setEditRosterName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Appointed Role Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Media Lead / Tenor Singer"
                    value={editRosterRole}
                    onChange={e => setEditRosterRole(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Member Status *</label>
                  <select
                    value={editRosterStatus}
                    onChange={e => setEditRosterStatus(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="In Training">In Training</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Assigned Sunday / Service Duty *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sanctuary Main Stream Switcher"
                  value={editRosterDuty}
                  onChange={e => setEditRosterDuty(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="name@gmail.com"
                    value={editRosterEmail}
                    onChange={e => setEditRosterEmail(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+232 76 000000"
                    value={editRosterPhone}
                    onChange={e => setEditRosterPhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRosterMember(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl shadow-xs cursor-pointer"
                >
                  Save Role Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- APPOINT NEW ROSTER MEMBER MODAL --- */}
      {showAddRosterModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                {(() => {
                  const lower = (activeDept || '').toLowerCase();
                  const isSocial = lower.includes('youth') || lower.includes('women') || lower.includes('men') || lower.includes('children') || lower.includes('fellowship') || lower.includes('social');
                  return (
                    <>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                        {isSocial ? '👥 Social Fellowship Member' : '🛠️ Service Department Volunteer'}
                      </span>
                      <h3 className="text-xl font-black text-slate-900 mt-1">
                        {isSocial ? `Add Member to ${activeDept}` : `Add Volunteer to ${activeDept}`}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {isSocial
                          ? 'Add a new member or leader to this social fellowship roster.'
                          : 'Register a new volunteer or team member to this service department roster.'}
                      </p>
                    </>
                  );
                })()}
              </div>
              <button onClick={() => setShowAddRosterModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddRosterMember} className="space-y-4 text-xs">
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-2">
                <label className="font-extrabold text-indigo-900 block">Quick Pick from Congregation Directory (Optional)</label>
                <select
                  value={selectedCongregationMemberId}
                  onChange={e => {
                    const mId = e.target.value;
                    setSelectedCongregationMemberId(mId);
                    if (mId) {
                      const found = congregationMembers.find(m => m.id === mId);
                      if (found) {
                        setAddRosterName(`${found.first_name} ${found.last_name}`);
                        setAddRosterEmail(found.email || '');
                        setAddRosterPhone(found.phone || '');
                      }
                    }
                  }}
                  className="w-full p-2 bg-white border border-indigo-200 rounded-xl font-bold text-xs text-slate-800 outline-none cursor-pointer"
                >
                  <option value="">-- Choose registered congregation member --</option>
                  {congregationMembers.map(m => (
                    <option key={m.id} value={m.id}>
                      👤 {m.first_name} {m.last_name} ({m.email || 'Member'})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-indigo-700 font-medium">Selecting auto-fills name and contact details. Or type details manually below!</p>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Member Full Name (Manual or Auto-Filled) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jonathan Davis"
                  value={addRosterName}
                  onChange={e => setAddRosterName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Appointed Role Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sound Engineer / Soprano Lead"
                    value={addRosterRole}
                    onChange={e => setAddRosterRole(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Initial Status *</label>
                  <select
                    value={addRosterStatus}
                    onChange={e => setAddRosterStatus(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Active">Active</option>
                    <option value="In Training">In Training</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Assigned Sunday / Service Duty *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunday 1st Service Lead"
                  value={addRosterDuty}
                  onChange={e => setAddRosterDuty(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="jdavis@gmail.com"
                    value={addRosterEmail}
                    onChange={e => setAddRosterEmail(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+232 76 123456"
                    value={addRosterPhone}
                    onChange={e => setAddRosterPhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddRosterModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus size={15} /> Confirm Appointment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRM DELETE ROSTER MEMBER MODAL --- */}
      {deletingRosterMember && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-5 text-xs animate-in fade-in">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Remove Roster Member?</h3>
                <p className="text-slate-500 text-xs">Confirm removal from {activeDept}</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
              <div className="font-extrabold text-slate-900 text-sm">{deletingRosterMember.name}</div>
              <div className="text-indigo-700 font-bold text-[11px]">{deletingRosterMember.role} • {deletingRosterMember.duty}</div>
              {deletingRosterMember.email && <div className="text-slate-500 text-[10px]">{deletingRosterMember.email}</div>}
            </div>

            <p className="text-slate-600 leading-relaxed font-medium">
              Are you sure you want to remove <strong>{deletingRosterMember.name}</strong> from the active {activeDept} roster?
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingRosterMember(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteRosterMember}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl shadow-sm cursor-pointer"
              >
                Confirm Removal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- LAUNCH MEMBER WELFARE CAMPAIGN DRIVE MODAL --- */}
      {showLaunchCampaignModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900">
                  New Member Drive Setup
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1">Launch Member Welfare Drive</h3>
                <p className="text-xs text-slate-500">Create a dedicated welfare assessment drive for a member in need.</p>
              </div>
              <button onClick={() => setShowLaunchCampaignModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveWelfareCampaign} className="space-y-4 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Select Beneficiary Member *</label>
                <select
                  required
                  value={campBeneficiaryId}
                  onChange={e => {
                    const mId = e.target.value;
                    setCampBeneficiaryId(mId);
                    const found = deptRoster.find(r => r.id === mId);
                    if (found) {
                      setCampBeneficiaryName(found.name);
                      setCampTitle(`${found.name}'s Welfare Support Drive`);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Choose Member from Roster --</option>
                  {deptRoster.map(m => (
                    <option key={m.id} value={m.id}>
                      👤 {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              {!campBeneficiaryId && (
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Or Type Beneficiary Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bro. David Koroma"
                    value={campBeneficiaryName}
                    onChange={e => {
                      setCampBeneficiaryName(e.target.value);
                      if (!campTitle || campTitle.includes('Welfare Support Drive')) {
                        setCampTitle(`${e.target.value}'s Welfare Support Drive`);
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Support Category / Event *</label>
                  <select
                    value={campReason}
                    onChange={e => setCampReason(e.target.value as WelfareReason)}
                    className="w-full p-2.5 bg-purple-50 border border-purple-200 text-purple-950 font-bold rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="marriage">💍 Marriage / Wedding</option>
                    <option value="burial_bereavement">🕊️ Burial & Bereavement</option>
                    <option value="sickness_medical">🏥 Sickness & Medical Relief</option>
                    <option value="naming_ceremony">👶 Child Naming Ceremony</option>
                    <option value="emergency_hardship">🚨 Emergency Hardship Support</option>
                    <option value="general_welfare">🤝 General Welfare Support</option>
                  </select>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Target Contribution / Member (SLE) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="200"
                    value={campExpectedPerMember}
                    onChange={e => {
                      const val = e.target.value;
                      setCampExpectedPerMember(val);
                      if (val && Number(val) > 0) {
                        setCampTargetTotal(Number(val) * Math.max(1, deptRoster.length));
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Drive Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. David Koroma Wedding Welfare Drive"
                  value={campTitle}
                  onChange={e => setCampTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Total Target Goal (SLE) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="2000"
                    value={campTargetTotal}
                    onChange={e => setCampTargetTotal(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Contribution Deadline *</label>
                  <input
                    type="date"
                    required
                    value={campDeadline}
                    onChange={e => setCampDeadline(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Drive Description / Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Details regarding the support drive..."
                  value={campDesc}
                  onChange={e => setCampDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLaunchCampaignModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Heart size={16} /> Launch Drive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- LOG MEMBER CONTRIBUTION MODAL --- */}
      {showRecordContribModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900">
                  Treasury Contribution Entry
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1">Log Contribution for {activeDept}</h3>
                <p className="text-xs text-slate-500">Record member welfare funds, monthly dues, or project pledges.</p>
              </div>
              <button onClick={() => setShowRecordContribModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveMemberContribution} className="space-y-4 text-xs">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Select Member from Roster *</label>
                <select
                  required
                  value={contribMemberId}
                  onChange={e => {
                    const mId = e.target.value;
                    setContribMemberId(mId);
                    const found = deptRoster.find(r => r.id === mId);
                    if (found) setContribMemberName(found.name);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Choose Roster Member --</option>
                  {deptRoster.map(m => (
                    <option key={m.id} value={m.id}>
                      👤 {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              {!contribMemberId && (
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Or Type Member Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. David Koroma"
                    value={contribMemberName}
                    onChange={e => setContribMemberName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Contribution Category *</label>
                  <select
                    value={contribCategory}
                    onChange={e => setContribCategory(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="welfare">🤝 Welfare Contribution</option>
                    <option value="monthly_dues">📅 Monthly Membership Dues</option>
                    <option value="special_support">🎯 Special Support / Pledge</option>
                  </select>
                </div>

                {contribCategory === 'welfare' && (
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Welfare Reason / Event *</label>
                    <select
                      value={contribWelfareReason}
                      onChange={e => setContribWelfareReason(e.target.value as any)}
                      className="w-full p-2.5 bg-purple-50 border border-purple-200 text-purple-950 font-bold rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="marriage">💍 Wedding & Marriage</option>
                      <option value="burial_bereavement">🕊️ Burial & Bereavement</option>
                      <option value="sickness_medical">🏥 Sickness & Medical Relief</option>
                      <option value="naming_ceremony">👶 Child Naming Ceremony</option>
                      <option value="emergency_hardship">🚨 Emergency Hardship Relief</option>
                      <option value="general_welfare">🤝 General Welfare Fund</option>
                    </select>
                  </div>
                )}

                {contribCategory === 'monthly_dues' && (
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Period (Month & Year) *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 2026-11 (November 2026)"
                      value={contribMonthYear}
                      onChange={e => setContribMonthYear(e.target.value)}
                      className="w-full p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-950"
                    />
                  </div>
                )}

                {contribCategory === 'special_support' && (
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Pledge / Task Purpose *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Choir Robes / Audio Switcher"
                      value={contribSpecialPurpose}
                      onChange={e => setContribSpecialPurpose(e.target.value)}
                      className="w-full p-2.5 bg-blue-50 border border-blue-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-blue-950"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Amount (SLE) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 350"
                    value={contribAmount}
                    onChange={e => setContribAmount(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Payment Channel *</label>
                  <select
                    value={contribPaymentMethod}
                    onChange={e => setContribPaymentMethod(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="mobile_money">📱 Mobile Money (Afrimoney/Orange)</option>
                    <option value="cash">💵 Cash Handover</option>
                    <option value="bank_transfer">🏦 Bank Wire Transfer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Transaction Ref / Receipt # (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. MM-881299"
                  value={contribRef}
                  onChange={e => setContribRef(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium font-mono outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Additional Notes</label>
                <input
                  type="text"
                  placeholder="Optional details or instructions..."
                  value={contribNotes}
                  onChange={e => setContribNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRecordContribModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={16} /> Save Contribution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DIGITAL MEMBER WELFARE PASSBOOK CARD MODAL --- */}
      {showWelfareCardModal && selectedWelfareCard && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6 relative overflow-hidden">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CreditCard size={22} className="text-purple-600" />
                <div>
                  <h3 className="text-lg font-black text-slate-900">Member Digital Welfare Passbook</h3>
                  <p className="text-xs text-slate-500">{selectedWelfareCard.department_name}</p>
                </div>
              </div>
              <button onClick={() => setShowWelfareCardModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                <X size={20} />
              </button>
            </div>

            {/* Realistic Welfare Passbook Digital Card */}
            <div className="bg-gradient-to-br from-purple-900 via-slate-900 to-indigo-950 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden border border-purple-500/30 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-purple-300 block">
                    FAITHCONNECT • GRACE CATHEDRAL
                  </span>
                  <h4 className="font-extrabold text-sm text-white mt-0.5">{selectedWelfareCard.department_name} Passbook</h4>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {selectedWelfareCard.status}
                </span>
              </div>

              <div className="flex items-center gap-4 py-2">
                <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white font-black flex items-center justify-center text-2xl shadow-inner">
                  {selectedWelfareCard.member_name[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">{selectedWelfareCard.member_name}</h3>
                  <div className="text-xs font-mono font-bold text-purple-300 mt-0.5">
                    Card ID: {selectedWelfareCard.card_number}
                  </div>
                  <p className="text-[10px] text-slate-300 mt-0.5">Issued: {selectedWelfareCard.issued_date}</p>
                </div>
              </div>

              {/* Passbook Financial Counters */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-white/10 rounded-2xl border border-white/15 text-center text-xs backdrop-blur-md">
                <div>
                  <span className="text-[9px] font-bold text-purple-200 uppercase block">Welfare Fund</span>
                  <strong className="font-mono text-sm font-black text-white">SLE {selectedWelfareCard.total_welfare_paid.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-emerald-200 uppercase block">Monthly Dues</span>
                  <strong className="font-mono text-sm font-black text-white">SLE {selectedWelfareCard.total_dues_paid.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-blue-200 uppercase block">Task Support</span>
                  <strong className="font-mono text-sm font-black text-white">SLE {selectedWelfareCard.total_support_paid.toLocaleString()}</strong>
                </div>
              </div>

              {/* Barcode Verification Stamp */}
              <div className="pt-2 flex items-center justify-between border-t border-white/10 text-[10px] font-mono text-slate-400">
                <span>OFFICIAL TREASURY SEAL</span>
                <span className="text-purple-300 font-bold">VERIFIED 2026 ✓</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={handlePrintWelfareCard}
                className="w-full sm:w-auto px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Printer size={15} /> Print Welfare Card
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setShowWelfareCardModal(false);
                    openRecordContribForMember({ id: selectedWelfareCard.member_id, name: selectedWelfareCard.member_name });
                  }}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus size={15} /> Log Contribution
                </button>
                <button
                  type="button"
                  onClick={() => setShowWelfareCardModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- IN-APP CONTRIBUTION REMINDERS & NOTIFICATIONS MODAL --- */}
      {showInAppNotifModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl border border-slate-200 space-y-5 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center font-bold shrink-0">
                  <Bell size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">In-App Reminders & Notifications</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800">
                      {activeDept}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">System dispatch log for member contribution notifications.</p>
                </div>
              </div>

              <button 
                onClick={() => setShowInAppNotifModal(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick Actions Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-purple-50/70 rounded-2xl border border-purple-100 text-xs shrink-0">
              <div className="flex items-center gap-2 text-purple-900 font-bold">
                <span>Total Dispatched: <strong>{deptNotifications.length}</strong></span>
                <span>•</span>
                <span className="text-rose-700 font-extrabold">Unread: {deptNotifications.filter(n => !n.is_read).length}</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  markAllDeptNotificationsAsRead(activeDept);
                  setDeptNotifications(getDepartmentNotifications(activeDept));
                  setProposalSuccessToast('All in-app reminders marked as read');
                  setTimeout(() => setProposalSuccessToast(null), 3000);
                }}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-[11px] shadow-2xs cursor-pointer transition-all"
              >
                ✓ Mark All Read
              </button>
            </div>

            {/* List of In-App Reminders */}
            <div className="space-y-3 overflow-y-auto pr-1 flex-1 text-xs">
              {deptNotifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                  No in-app reminders dispatched yet for {activeDept}. Click "Remind Pending" on any welfare drive or monthly dues tab to send instant reminders!
                </div>
              ) : (
                deptNotifications.map(notif => (
                  <div 
                    key={notif.id} 
                    className={`p-4 rounded-2xl border transition-all space-y-2 relative ${
                      notif.is_read ? 'bg-slate-50/70 border-slate-200 opacity-80' : 'bg-purple-50/50 border-purple-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            notif.type === 'welfare_reminder' ? 'bg-purple-200 text-purple-900' :
                            notif.type === 'dues_reminder' ? 'bg-emerald-200 text-emerald-900' :
                            'bg-indigo-200 text-indigo-900'
                          }`}>
                            {notif.type.replace('_', ' ')}
                          </span>
                          <span className="font-extrabold text-slate-900 text-xs">{notif.title}</span>
                        </div>
                        <p className="text-[11px] text-purple-900 font-semibold">
                          Recipient: <strong className="text-slate-900">{notif.recipient_member_name || 'All Members'}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            deleteNotification(notif.id);
                            setDeptNotifications(getDepartmentNotifications(activeDept));
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer transition-colors"
                          title="Delete Reminder Log"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <p className="text-slate-700 leading-relaxed text-[11px] bg-white p-2.5 rounded-xl border border-slate-200/80">
                      "{notif.message}"
                    </p>

                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 font-mono">
                      <span>Sent by: {notif.sent_by} • {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!notif.is_read) {
                            markNotificationAsRead(notif.id);
                            setDeptNotifications(getDepartmentNotifications(activeDept));
                          }
                        }}
                        className={`font-extrabold cursor-pointer ${notif.is_read ? 'text-emerald-700' : 'text-purple-700 hover:underline'}`}
                      >
                        {notif.is_read ? 'Read ✓' : 'Mark Read'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0 text-xs">
              <span className="text-[11px] text-slate-400 font-medium">Auto-synced with member passbooks</span>
              <button
                type="button"
                onClick={() => setShowInAppNotifModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl shadow-xs cursor-pointer"
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

// --- Giving & Tithes Portal ---

const GivingPage = ({ profile }: { profile: Profile | null }) => {
  const [givingConfig, setGivingConfig] = useState<GivingConfig>(getGivingConfig());
  const [selectedAmount, setSelectedAmount] = useState<number | string>(100);
  const [customAmount, setCustomAmount] = useState('');
  
  // Frequency Selection (Recurring Contributions)
  const [frequency, setFrequency] = useState<'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'>('one_time');

  // Fund selection
  const [selectedFundId, setSelectedFundId] = useState<string>('f1');
  const [customFundName, setCustomFundName] = useState('');

  // Payment Method
  const [method, setMethod] = useState<'card' | 'bank_transfer' | 'mobile_money'>('card');
  
  // Card Form State
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(profile ? `${profile.first_name} ${profile.last_name}` : '');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // Mobile Money Form State
  const [selectedMobileProvider, setSelectedMobileProvider] = useState<string>('Afrimoney');
  const [mobileSenderPhone, setMobileSenderPhone] = useState(profile?.phone || '');
  const [mobileTxnId, setMobileTxnId] = useState('');
  const [mobileTxnDate, setMobileTxnDate] = useState(new Date().toISOString().slice(0, 10));

  // Bank Wire Proof Form State
  const [bankWireRef, setBankWireRef] = useState('');

  const [givingSuccess, setGivingSuccess] = useState(false);
  const [latestReceipt, setLatestReceipt] = useState<any>(null);
  const [history, setHistory] = useState<FinancialRecord[]>([]);

  const isStaff = profile && ['super_admin', 'admin', 'pastor', 'finance_officer', 'district_admin'].includes(profile.primary_role);
  const userFullName = profile ? `${profile.first_name} ${profile.last_name}` : 'Grace Cathedral Member';

  useEffect(() => {
    setGivingConfig(getGivingConfig());
    const fetchHistory = async () => {
      const { data } = await supabase.from('financial_records').select('*').order('date', { ascending: false });
      if (data) setHistory(data as FinancialRecord[]);
    };
    fetchHistory();
  }, []);

  const activeFunds = givingConfig.funds.filter(f => f.is_active);
  const activeGateways = givingConfig.mobile_gateways.filter(g => g.is_active);
  const currentGateway = activeGateways.find(g => g.provider === selectedMobileProvider) || activeGateways[0];

  const handleGive = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmount = selectedAmount === 'custom' ? Number(customAmount) : Number(selectedAmount);
    if (!finalAmount || finalAmount <= 0) return;

    // Resolve Category/Fund Name
    let fundName = 'Tithe';
    if (selectedFundId === 'custom_fund') {
      fundName = customFundName.trim() || 'Custom Ministry Offering';
    } else {
      const found = activeFunds.find(f => f.id === selectedFundId);
      if (found) fundName = found.name;
    }

    // Determine status & notes
    let status: 'completed' | 'pending_verification' = 'completed';
    let notes = '';
    let cardLast4 = '';
    let senderPhone = '';
    let txnId = '';

    if (method === 'card') {
      cardLast4 = cardNumber.replace(/\s+/g, '').slice(-4) || '4242';
      notes = `Card payment ending in ${cardLast4}`;
    } else if (method === 'bank_transfer') {
      status = 'pending_verification';
      txnId = bankWireRef.trim() || `WIRE-${Date.now().toString().slice(-6)}`;
      notes = `Bank Wire Reference: ${txnId}`;
    } else if (method === 'mobile_money') {
      status = 'pending_verification';
      senderPhone = mobileSenderPhone.trim();
      txnId = mobileTxnId.trim() || `MM-${Date.now().toString().slice(-6)}`;
      notes = `${selectedMobileProvider} Mobile Money from ${senderPhone} (Txn ID: ${txnId})`;
    }

    const receipt: FinancialRecord = {
      id: `rec_${Date.now()}`,
      contributor_name: userFullName,
      user_id: profile?.id,
      type: 'income',
      amount: finalAmount,
      currency: givingConfig.currency_symbol || 'SLE',
      category: fundName,
      payment_method: method,
      status,
      is_recurring: frequency !== 'one_time',
      frequency,
      date: new Date().toISOString(),
      notes,
      sender_phone: senderPhone || undefined,
      transaction_id: txnId || undefined,
      card_last4: cardLast4 || undefined,
      card_brand: method === 'card' ? 'Visa' : undefined
    };

    await supabase.from('financial_records').insert(receipt);
    setLatestReceipt(receipt);
    setGivingSuccess(true);
    setHistory(prev => [receipt, ...prev]);

    // Reset Form Fields
    setCustomAmount('');
    setCustomFundName('');
    setBankWireRef('');
    setMobileTxnId('');
  };

  // RBAC Filtering: Standard members view personal records, staff view ledger
  const filteredHistory = isStaff 
    ? history 
    : history.filter(item => 
        item.contributor_name.toLowerCase().includes(profile?.first_name?.toLowerCase() || 'grace') ||
        item.contributor_name === userFullName ||
        item.user_id === profile?.id
      );

  // --- CSV Export Function for Personal Statement ---
  const downloadCSVStatement = () => {
    if (filteredHistory.length === 0) return;
    const headers = ["Receipt ID", "Date", "Contributor", "Category", "Amount (SLE)", "Frequency", "Payment Method", "Status", "Transaction Ref"];
    const rows = filteredHistory.map(r => [
      r.id,
      new Date(r.date).toLocaleDateString(),
      `"${r.contributor_name}"`,
      `"${r.category}"`,
      r.amount,
      r.frequency || 'one_time',
      r.payment_method,
      r.status || 'completed',
      r.transaction_id || r.card_last4 || 'N/A'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `grace_cathedral_giving_statement_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- PDF / Print Tax Statement Window ---
  const downloadPDFTaxStatement = () => {
    const totalGiving = filteredHistory.filter(r => r.status === 'completed' || !r.status).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const cp = getChurchProfile();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Annual Contribution & Tax Statement - ${cp.name}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 40px; color: #1e293b; background: #fff; }
            .header { border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start; }
            .logo { font-size: 24px; font-weight: 900; color: #4338ca; letter-spacing: -0.5px; }
            .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
            .tax-badge { background: #e0e7ff; color: #3730a3; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; font-size: 13px; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .meta-grid strong { color: #0f172a; }
            table { w-full; width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; }
            td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
            .total-box { background: #ecfdf5; border: 1px solid #a7f3d0; padding: 20px; border-radius: 12px; text-align: right; margin-bottom: 30px; }
            .total-amount { font-size: 24px; font-weight: 900; color: #059669; }
            .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; pt-20; padding-top: 20px; font-size: 11px; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">${cp.name}</div>
              <div class="subtitle">Official Annual Contribution & Tax Statement • Year ${new Date().getFullYear()}</div>
            </div>
            <div class="tax-badge">Official Tax Record</div>
          </div>

          <div class="meta-grid">
            <div>
              <p><strong>Member Name:</strong> ${userFullName}</p>
              <p><strong>Email Address:</strong> ${profile?.email || 'N/A'}</p>
              <p><strong>Phone:</strong> ${profile?.phone || 'N/A'}</p>
            </div>
            <div>
              <p><strong>Tax Year:</strong> ${new Date().getFullYear()}</p>
              <p><strong>Currency:</strong> ${givingConfig.currency_symbol || 'SLE'}</p>
              <p><strong>Date Issued:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category / Fund</th>
                <th>Frequency</th>
                <th>Payment Method</th>
                <th style="text-align: right;">Amount (SLE)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredHistory.map(r => `
                <tr>
                  <td>${new Date(r.date).toLocaleDateString()}</td>
                  <td><strong>${r.category}</strong></td>
                  <td>${r.frequency || 'one_time'}</td>
                  <td style="text-transform: capitalize;">${r.payment_method.replace('_', ' ')}</td>
                  <td style="text-align: right; font-weight: bold; color: #059669;">SLE ${Number(r.amount).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="total-box">
            <div style="font-size: 12px; color: #047857; font-weight: 800; text-transform: uppercase;">Total Tax-Deductible Contribution (${new Date().getFullYear()})</div>
            <div class="total-amount">${givingConfig.currency_symbol || 'SLE'} ${totalGiving.toLocaleString()}</div>
          </div>

          <div class="footer">
            ${cp.name} Treasury • "God loves a cheerful giver." (2 Corinthians 9:7)<br/>
            This document serves as an official receipt for tax purposes. No goods or services were provided in exchange for this contribution.
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
            {givingConfig.currency_symbol || 'SLE'} Stewardship
          </span>
          <span className="text-xs text-slate-400 font-semibold">• FaithConnect Grace Cathedral</span>
        </div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Giving, Tithes & Offerings</h2>
        <p className="text-slate-500 text-sm">Honoring God through cheerful, faithful stewardship and recurring pledges at Grace Cathedral.</p>
      </div>

      {/* Pastoral/Admin RBAC Banner */}
      {isStaff && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-bold text-indigo-900 flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-indigo-600" /> Financial Officer & Leadership Access
            </p>
            <p className="text-indigo-700 mt-0.5">As a financial officer or administrator, you can manage giving funds, verify mobile/bank transfers, and audit the financial ledger.</p>
          </div>
          <Link
            to="/portal/admin?tab=financials"
            className="px-3.5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors whitespace-nowrap shadow-xs"
          >
            Manage Tithes Ledger &rarr;
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Giving Form Card */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          {givingSuccess && latestReceipt ? (
            <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl space-y-4 text-center animate-in fade-in">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
                <Check size={28} />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Thank You For Your Giving!</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                "Bring the whole tithe into the storehouse, that there may be food in my house." — Malachi 3:10
              </p>

              {/* Receipt Box */}
              <div className="p-4 bg-white rounded-2xl border border-emerald-100 text-left text-xs space-y-2 max-w-sm mx-auto shadow-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Confirmation ID:</span>
                  <span className="font-mono font-bold text-slate-800">{latestReceipt.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount:</span>
                  <span className="font-extrabold text-emerald-600 text-base">{latestReceipt.currency || 'SLE'} {latestReceipt.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Giving Fund:</span>
                  <span className="font-extrabold text-slate-900">{latestReceipt.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Frequency:</span>
                  <span className="font-bold text-indigo-600 capitalize">{latestReceipt.frequency || 'one_time'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment Method:</span>
                  <span className="font-bold text-slate-800 capitalize">{latestReceipt.payment_method.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className={`font-black uppercase px-2 py-0.5 rounded text-[9px] ${
                    latestReceipt.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {latestReceipt.status === 'completed' ? '✓ Received & Settled' : '⏳ Pending Verification'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-100 text-[11px]">
                  <span className="text-slate-400">Date:</span>
                  <span className="text-slate-600 font-medium">{new Date(latestReceipt.date).toLocaleString()}</span>
                </div>
              </div>

              <button 
                type="button" 
                onClick={() => setGivingSuccess(false)}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all cursor-pointer shadow-md"
              >
                Make Another Contribution
              </button>
            </div>
          ) : (
            <form onSubmit={handleGive} className="space-y-6">
              
              {/* Category / Giving Funds Pills & Custom Fund */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Select Giving Fund Category *
                  </label>
                  <span className="text-[10px] text-indigo-600 font-bold">Configured Church Funds</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activeFunds.map(fund => (
                    <button
                      key={fund.id}
                      type="button"
                      onClick={() => setSelectedFundId(fund.id)}
                      className={`py-3 px-3 rounded-2xl text-xs font-extrabold border transition-all cursor-pointer text-left flex flex-col justify-between ${
                        selectedFundId === fund.id 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200' 
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-indigo-300'
                      }`}
                    >
                      <span>{fund.name}</span>
                      {fund.description && (
                        <span className={`text-[9px] font-normal truncate mt-1 ${selectedFundId === fund.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {fund.description}
                        </span>
                      )}
                    </button>
                  ))}

                  {givingConfig.allow_custom_funds && (
                    <button
                      type="button"
                      onClick={() => setSelectedFundId('custom_fund')}
                      className={`py-3 px-3 rounded-2xl text-xs font-extrabold border transition-all cursor-pointer text-left flex flex-col justify-between ${
                        selectedFundId === 'custom_fund' 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200' 
                          : 'bg-indigo-50/60 border-indigo-200 text-indigo-900 hover:bg-indigo-100'
                      }`}
                    >
                      <span>✍️ Enter Custom Given Fund</span>
                      <span className={`text-[9px] font-normal truncate mt-1 ${selectedFundId === 'custom_fund' ? 'text-indigo-100' : 'text-indigo-600'}`}>
                        Specify custom cause / project
                      </span>
                    </button>
                  )}
                </div>

                {/* Custom Given Fund Input */}
                {selectedFundId === 'custom_fund' && (
                  <div className="mt-3 p-3 bg-indigo-50/80 border border-indigo-200 rounded-2xl space-y-1.5 animate-in fade-in">
                    <label className="text-[10px] font-extrabold uppercase text-indigo-950 tracking-wider block">
                      Custom Given Fund Name / Project Title *
                    </label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Youth Retreat Sponsorship or Instrument Upgrade"
                      value={customFundName}
                      onChange={(e) => setCustomFundName(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Amount Buttons in SLE Currency */}
              <div>
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-2">
                  Contribution Amount ({givingConfig.currency_symbol || 'SLE'}) *
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[100, 250, 500, 1000, 2500].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setSelectedAmount(amt)}
                      className={`py-3 rounded-2xl text-xs font-black border transition-all cursor-pointer ${
                        selectedAmount === amt 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-indigo-300'
                      }`}
                    >
                      {givingConfig.currency_symbol || 'SLE'} {amt}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedAmount('custom')}
                    className={`py-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedAmount === 'custom' 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {selectedAmount === 'custom' && (
                  <div className="mt-3">
                    <input 
                      type="number" 
                      required
                      min={1}
                      placeholder={`Enter custom amount in ${givingConfig.currency_symbol || 'SLE'}...`}
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* --- RECURRING CONTRIBUTION FREQUENCY --- */}
              <div>
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-2">
                  Contribution Frequency & Recurring Schedule *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'one_time', label: '⚡ One-Time' },
                    { id: 'weekly', label: '📅 Weekly' },
                    { id: 'biweekly', label: '📆 Bi-Weekly' },
                    { id: 'monthly', label: '🔄 Monthly' }
                  ].map(freq => (
                    <button
                      key={freq.id}
                      type="button"
                      onClick={() => setFrequency(freq.id as any)}
                      className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-center ${
                        frequency === freq.id 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md font-black' 
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300'
                      }`}
                    >
                      {freq.label}
                    </button>
                  ))}
                </div>
                {frequency !== 'one_time' && (
                  <p className="text-[11px] text-indigo-600 font-bold mt-2 bg-indigo-50 p-2 rounded-xl border border-indigo-100">
                    🔄 Automatically schedule this {frequency} contribution for your covenant tithe or pledge.
                  </p>
                )}
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-2">
                  Payment Method *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'card', label: '💳 Credit / Debit Card' },
                    { id: 'bank_transfer', label: '🏛️ Bank Wire / ACH' },
                    { id: 'mobile_money', label: '📱 Mobile Money (SLE)' }
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id as any)}
                      className={`p-3 rounded-2xl text-xs font-bold border text-center transition-all cursor-pointer ${
                        method === m.id 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md font-black' 
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* --- METHOD 1: CREDIT / DEBIT CARD INPUTS --- */}
              {method === 'card' && (
                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                      💳 Card Payment Details
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-black uppercase">256-Bit Encrypted</span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="font-bold text-slate-600 text-[11px] block mb-0.5">Cardholder Name *</label>
                      <input 
                        type="text" 
                        required
                        placeholder="John Doe"
                        value={cardHolder}
                        onChange={e => setCardHolder(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-600 text-[11px] block mb-0.5">Card Number *</label>
                      <input 
                        type="text" 
                        required
                        maxLength={19}
                        placeholder="4000 1234 5678 9010"
                        value={cardNumber}
                        onChange={e => setCardNumber(e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim())}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-bold text-slate-600 text-[11px] block mb-0.5">Expiry Date *</label>
                        <input 
                          type="text" 
                          required
                          placeholder="MM/YY"
                          maxLength={5}
                          value={cardExpiry}
                          onChange={e => setCardExpiry(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-center font-bold outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-600 text-[11px] block mb-0.5">CVV / CVC *</label>
                        <input 
                          type="password" 
                          required
                          maxLength={4}
                          placeholder="123"
                          value={cardCvc}
                          onChange={e => setCardCvc(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-center font-bold outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- METHOD 2: BANK WIRE / ACH TRANSFER DETAILS & PROOF --- */}
              {method === 'bank_transfer' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3.5 animate-in fade-in">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                      🏛️ Official Church Bank Transfer Account
                    </span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold uppercase">Direct Wire</span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5 text-xs text-slate-800 font-medium">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Bank Name:</span>
                      <strong className="text-indigo-900 font-extrabold">{givingConfig.bank_details.bank_name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Account Name:</span>
                      <strong>{givingConfig.bank_details.account_name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Account Number:</span>
                      <strong className="font-mono bg-slate-100 px-2 py-0.5 rounded text-indigo-700">{givingConfig.bank_details.account_number}</strong>
                    </div>
                    {givingConfig.bank_details.swift_code && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">SWIFT / BIC Code:</span>
                        <strong className="font-mono">{givingConfig.bank_details.swift_code}</strong>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-100">
                      💡 {givingConfig.bank_details.instructions}
                    </p>
                  </div>

                  {/* Wire Proof Form Input */}
                  <div className="space-y-1.5 pt-1">
                    <label className="font-extrabold text-slate-800 text-xs block">
                      Provide Bank Wire Reference / Receipt Proof *
                    </label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. SLCB-WIRE-98213 or Bank Transfer Slip ID"
                      value={bankWireRef}
                      onChange={e => setBankWireRef(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400">Our financial officer will verify your bank wire reference and confirm your giving ledger entry.</p>
                  </div>
                </div>
              )}

              {/* --- METHOD 3: MOBILE MONEY (AFRIMONEY, ORANGE MONEY, ETC) --- */}
              {method === 'mobile_money' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                      📱 Regional Mobile Money Payment (SLE)
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-black uppercase">Instant Mobile Transfer</span>
                  </div>

                  {/* Provider Choice */}
                  <div>
                    <label className="font-bold text-slate-700 text-xs block mb-1">Select Mobile Money Provider *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {activeGateways.map(g => (
                        <button
                          key={g.provider}
                          type="button"
                          onClick={() => setSelectedMobileProvider(g.provider)}
                          className={`p-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                            selectedMobileProvider === g.provider 
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                              : 'bg-white border-slate-200 text-slate-800 hover:border-indigo-300'
                          }`}
                        >
                          {g.provider}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment Instructions Banner */}
                  {currentGateway && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-1.5 text-xs text-amber-950">
                      <div className="flex justify-between font-bold">
                        <span>Merchant Name: <strong>{currentGateway.merchant_name}</strong></span>
                        <span className="font-mono bg-amber-200/60 px-2 py-0.5 rounded text-amber-900">{currentGateway.merchant_number}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-amber-900">
                        <strong>Dial Instructions:</strong> {currentGateway.dial_code_instructions}
                      </p>
                    </div>
                  )}

                  {/* Mobile Payment Proof Fields */}
                  <div className="p-3 bg-white rounded-2xl border border-slate-200 space-y-3">
                    <span className="font-extrabold text-slate-900 text-xs block border-b pb-1">
                      ✍️ Submit Payment Proof Details
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="font-bold text-slate-600 block mb-0.5">Sender Mobile Number *</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. 077 123 456"
                          value={mobileSenderPhone}
                          onChange={e => setMobileSenderPhone(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-600 block mb-0.5">Transaction ID / SMS Code *</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. MP261031.1042.A812"
                          value={mobileTxnId}
                          onChange={e => setMobileTxnId(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5 text-xs">Date of Transfer *</label>
                      <input 
                        type="date" 
                        required
                        value={mobileTxnDate}
                        onChange={e => setMobileTxnDate(e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-base font-black hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Gift size={18} /> Confirm & Submit Contribution
              </button>
            </form>
          )}
        </div>

        {/* Giving History Panel & Statement Export */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 text-base">
                {isStaff ? 'Church Giving Feed' : 'My Giving Statements'}
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={downloadCSVStatement}
                  title="Export Giving History as CSV File"
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <Download size={12} /> CSV
                </button>
                <button
                  type="button"
                  onClick={downloadPDFTaxStatement}
                  title="Download Annual Tax Contribution Statement PDF"
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center gap-1"
                >
                  <Printer size={12} /> Tax PDF
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              {isStaff ? 'Recent congregational receipts' : 'Your personal contribution history & tax statements'}
            </p>

            {filteredHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs italic">
                No personal giving records found. Make your first contribution above!
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1">
                {filteredHistory.map(item => (
                  <div key={item.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-800">{item.contributor_name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">{item.category.replace('_', ' ')}</span>
                        {item.frequency && item.frequency !== 'one_time' && (
                          <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded">
                            {item.frequency}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-600">{item.currency || 'SLE'} {Number(item.amount).toLocaleString()}</div>
                      <div className="text-[10px] text-slate-400">{new Date(item.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            <button
              onClick={downloadPDFTaxStatement}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer size={14} /> Download Official Tax Statement (PDF)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Prayer Wall Page ---

const PrayerPage = ({ profile }: { profile: Profile | null }) => {
  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [newRequest, setNewRequest] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadPrayers = async () => {
      const { data } = await supabase.from('prayer_requests').select('*').order('date', { ascending: false });
      if (data) setPrayers(data as PrayerRequest[]);
    };
    loadPrayers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.trim()) return;
    setSubmitting(true);

    const prayer: PrayerRequest = {
      id: `pray_${Date.now()}`,
      member_name: isAnonymous ? 'Grace Cathedral Sister / Brother' : `${profile?.first_name || 'Faithful'} ${profile?.last_name || 'Member'}`,
      request: newRequest.trim(),
      date: new Date().toISOString(),
      is_anonymous: isAnonymous,
      prayed_count: 1
    };

    await supabase.from('prayer_requests').insert(prayer);
    setPrayers(prev => [prayer, ...prev]);
    setNewRequest('');
    setSubmitting(false);
  };

  const incrementPrayer = (id: string) => {
    setPrayers(prev => prev.map(p => p.id === id ? { ...p, prayed_count: p.prayed_count + 1 } : p));
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Church Prayer Wall</h2>
        <p className="text-slate-500 text-sm">"Bear one another's burdens, and so fulfill the law of Christ." — Galatians 6:2</p>
      </div>

      {/* Submit Prayer Box */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-base">Submit a Prayer Request</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea 
            rows={3}
            required
            placeholder="Share your prayer need, family petition, healing request, or praise report..."
            value={newRequest}
            onChange={(e) => setNewRequest(e.target.value)}
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input 
                type="checkbox" 
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600"
              />
              <span>Post Anonymously</span>
            </label>

            <button 
              type="submit" 
              disabled={submitting || !newRequest.trim()}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Send size={14} /> Submit to Prayer Wall
            </button>
          </div>
        </form>
      </div>

      {/* Prayer Feed */}
      <div className="space-y-4">
        {prayers.map(p => (
          <div key={p.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                  {p.member_name[0]}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{p.member_name}</h4>
                  <p className="text-[10px] text-slate-400">{new Date(p.date).toLocaleDateString()}</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Grace Cathedral</span>
            </div>

            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
              {p.request}
            </p>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-slate-400">
                {p.prayed_count} Believers Prayed
              </span>
              <button 
                type="button"
                onClick={() => incrementPrayer(p.id)}
                className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Heart size={14} fill="currentColor" /> I Prayed For This
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Church Events & Calendar Page with "Notify Me" & Countdown Timers ---

// --- Church Events & Calendar Page with Month Grid, RSVP & Calendar Downloads ---

const CalendarPage = ({ profile }: { profile: Profile | null }) => {
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar View Mode: 'calendar' (Month Matrix) | 'agenda' (Cards List) | 'week'
  const [viewMode, setViewMode] = useState<'calendar' | 'agenda' | 'week'>('calendar');

  // Month navigation for Month Grid View
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date(2026, 10, 1)); // Default Nov 2026
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ dayNumber: number; dateStr: string; events: ChurchEvent[] } | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedAudience, setSelectedAudience] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showQRPass, setShowQRPass] = useState<{ event: ChurchEvent; reg: EventRegistration } | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    const [evtRes, regRes] = await Promise.all([
      supabase.from('events').select('*').order('start_time', { ascending: true }),
      supabase.from('event_registrations').select('*')
    ]);

    if (evtRes.data) setEvents(evtRes.data as ChurchEvent[]);
    if (regRes.data) setRegistrations(regRes.data as EventRegistration[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleRSVPToggle = async (evt: ChurchEvent) => {
    const userEmail = profile?.email || 'member@faithconnect.church';
    const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'Grace Cathedral Member';

    try {
      const existingReg = registrations.find(r =>
        r.event_id === evt.id && (r.user_id === profile?.id || r.email === userEmail)
      );

      if (existingReg) {
        const { error: deleteError } = await supabase
          .from('event_registrations')
          .delete()
          .eq('id', existingReg.id);
        if (deleteError) throw deleteError;

        if (existingReg.status === 'confirmed') {
          const newCount = Math.max(0, (evt.registered_count || 1) - 1);
          const { error: countError } = await supabase
            .from('events')
            .update({ registered_count: newCount })
            .eq('id', evt.id);
          if (countError) throw countError;
        }
        setToastMessage(`Your RSVP for "${evt.title}" has been cancelled.`);
      } else {
        const isAtCapacity = (evt.registered_count || 0) >= (evt.max_attendees || 9999);
        const regStatus: EventRegistration['status'] = isAtCapacity ? 'waitlist' : 'confirmed';

        const newReg: Omit<EventRegistration, 'id'> = {
          event_id: evt.id,
          user_id: profile?.auth_user_id || profile?.id,
          member_id: profile?.id,
          member_name: userName,
          email: userEmail,
          phone: profile?.phone || '',
          registered_at: new Date().toISOString(),
          status: regStatus
        };
        const { error: registrationError } = await supabase
          .from('event_registrations')
          .insert(newReg);
        if (registrationError) throw registrationError;

        if (!isAtCapacity) {
          const newCount = (evt.registered_count || 0) + 1;
          const { error: countError } = await supabase
            .from('events')
            .update({ registered_count: newCount })
            .eq('id', evt.id);
          if (countError) throw countError;
          setToastMessage(`🎉 Seat confirmed for "${evt.title}"! We look forward to worshipping with you.`);
        } else {
          setToastMessage(`⏳ Event "${evt.title}" is currently at capacity. You have been added to the Waitlist!`);
        }
      }

      await fetchEvents();
    } catch (error: any) {
      console.error('Event RSVP update failed:', error);
      setToastMessage(error?.message || 'Unable to update your event registration. Please try again.');
    }

    setTimeout(() => setToastMessage(null), 4000);
  };

  const downloadICS = (evt: ChurchEvent) => {
    const formatICSDate = (dtStr: string) => {
      const dt = new Date(dtStr);
      return dt.toISOString().replace(/-|:|\.\d\d\d/g, "");
    };

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FaithConnect Grace Cathedral//EN",
      "BEGIN:VEVENT",
      `SUMMARY:${evt.title}`,
      `DESCRIPTION:${(evt.description || '').replace(/\n/g, ' ')}`,
      `LOCATION:${evt.location || 'Grace Cathedral Sanctuary'}`,
      `DTSTART:${formatICSDate(evt.start_time)}`,
      `DTEND:${formatICSDate(evt.end_time)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${evt.title.replace(/\s+/g, '_').toLowerCase()}.ics`;
    a.click();
  };

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const featuredEvent = events.find(e => e.category === 'Conference' || e.registration_required) || events[0];

  const categoriesList = ['All', 'Worship Service', 'Special Service', 'Conference', 'Youth Event', 'Community Outreach', 'Prayer & Fasting', 'Fellowship & Social'];

  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.title.toLowerCase().includes(search.toLowerCase()) || (evt.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || evt.category === selectedCategory;
    const matchesAudience = selectedAudience === 'All' || evt.target_audience === selectedAudience;
    return matchesSearch && matchesCategory && matchesAudience;
  });

  const getEventUserReg = (evt: ChurchEvent) => {
    const userEmail = profile?.email || 'member@faithconnect.church';
    return registrations.find(r => r.event_id === evt.id && (r.user_id === profile?.id || r.email === userEmail));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 flex items-center gap-1">
              <Calendar size={12} /> Grace Cathedral Calendar
            </span>
            <span className="text-xs text-slate-400 font-semibold">• Faith & Fellowship Calendar</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Church Events & Calendar</h2>
          <p className="text-slate-500 text-sm mt-0.5">Explore Sunday services, conferences, youth rallies, and ministry gatherings.</p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start md:self-auto">
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'calendar' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Month Grid
          </button>
          <button
            onClick={() => setViewMode('agenda')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'agenda' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Program List
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'week' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Week
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="p-4 bg-indigo-600 text-white rounded-2xl text-xs font-bold shadow-lg flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-300 animate-bounce" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Featured Church Event Hero Banner */}
      {featuredEvent && (() => {
        const featReg = getEventUserReg(featuredEvent);
        const isFull = (featuredEvent.registered_count || 0) >= (featuredEvent.max_attendees || 350);
        return (
          <div className="relative rounded-3xl overflow-hidden bg-slate-900 text-white shadow-lg border border-slate-800">
            <img
              src={featuredEvent.featured_image || 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80'}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-35"
              referrerPolicy="no-referrer"
            />
            <div className="relative p-6 sm:p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-wider rounded-full shadow-sm">
                    ⭐ Featured Church Program
                  </span>
                  {(() => {
                    const rec = getRecurrenceBadge(featuredEvent.recurrence);
                    return (
                      <span className="px-3 py-1 bg-purple-500/30 text-purple-200 border border-purple-400/30 font-bold text-[10px] rounded-full flex items-center gap-1">
                        <span>{rec.icon}</span>
                        <span>{rec.label}</span>
                      </span>
                    );
                  })()}
                  {isFull && (
                    <span className="px-2.5 py-0.5 bg-rose-500 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-full">
                      At Capacity (Waitlist Open)
                    </span>
                  )}
                  <span className="text-xs text-amber-200 font-bold">
                    {new Date(featuredEvent.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                <h3 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">{featuredEvent.title}</h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-2">{featuredEvent.description}</p>

                <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-300 pt-1">
                  <span className="flex items-center gap-1.5"><Clock size={14} className="text-amber-400" /> {new Date(featuredEvent.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="flex items-center gap-1.5"><MapPin size={14} className="text-amber-400" /> {featuredEvent.location}</span>
                  <span className="flex items-center gap-1.5"><Users size={14} className="text-amber-400" /> {featuredEvent.organizer_name}</span>
                  
                  {/* Dedicated Event Treasury Account Badge */}
                  {(() => {
                    const acc = getEventAccount(featuredEvent.id, featuredEvent.title, featuredEvent.recurring_funding_allowance);
                    return (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-mono font-bold">
                        <Landmark size={13} className="text-emerald-400" />
                        <span>{featuredEvent.account_number || acc.account_number}</span>
                      </span>
                    );
                  })()}

                  {/* Open in Maps Button */}
                  {featuredEvent.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(featuredEvent.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition-all backdrop-blur-md"
                      title="Open location in Google Maps"
                    >
                      <MapPin size={13} className="text-amber-300" /> Open in Maps
                    </a>
                  )}
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/20 text-center space-y-3 shrink-0 self-start md:self-auto min-w-[240px]">
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-300 tracking-wider block">Seats & Capacity</span>
                  <p className="text-lg font-black text-white mt-0.5">
                    {featuredEvent.registered_count || 0} / {featuredEvent.max_attendees || 350} Registered
                  </p>
                </div>

                {featReg ? (
                  <button
                    onClick={() => handleRSVPToggle(featuredEvent)}
                    className={`w-full py-2.5 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 ${
                      featReg.status === 'waitlist' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-500 hover:bg-emerald-600'
                    }`}
                  >
                    {featReg.status === 'waitlist' ? <Clock size={16} /> : <CheckCircle2 size={16} />}
                    <span>{featReg.status === 'waitlist' ? '⏳ Waitlisted (Cancel)' : "✓ Reserved (Cancel)"}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleRSVPToggle(featuredEvent)}
                    className={`w-full py-2.5 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 ${
                      isFull ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' : 'bg-amber-400 hover:bg-amber-500 text-slate-950'
                    }`}
                  >
                    <Sparkles size={16} /> {isFull ? '⏳ Join Waitlist' : 'Reserve Seat'}
                  </button>
                )}

                <button
                  onClick={() => downloadICS(featuredEvent)}
                  className="w-full py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download size={13} /> Add to Calendar (.ics)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search church event..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700">
            <Filter size={14} className="text-slate-400 shrink-0" />
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 outline-none w-full cursor-pointer"
            >
              {categoriesList.map(c => (
                <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700">
            <Users size={14} className="text-slate-400 shrink-0" />
            <select
              value={selectedAudience}
              onChange={e => setSelectedAudience(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 outline-none w-full cursor-pointer"
            >
              <option value="All">All Audiences</option>
              <option value="All Congregation">All Congregation</option>
              <option value="Youth & Teens">Youth & Teens</option>
              <option value="Men">Men</option>
              <option value="Women">Women</option>
            </select>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: MONTH GRID MATRIX */}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <h3 className="font-extrabold text-slate-900 text-lg">
                {monthNames[month]} {year}
              </h3>
              <span className="text-xs text-slate-400 font-semibold">• Grace Cathedral Schedule</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentMonthDate(new Date(year, month - 1, 1))}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentMonthDate(new Date())}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Today
              </button>
              <button
                onClick={() => setCurrentMonthDate(new Date(year, month + 1, 1))}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 text-center font-black text-slate-400 text-[10px] uppercase tracking-wider py-1 border-b border-slate-100">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Calendar Grid Cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {/* Blank leading days */}
            {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
              <div key={`blank-${idx}`} className="h-24 sm:h-28 bg-slate-50/50 rounded-2xl border border-dashed border-slate-100 p-1.5 opacity-40" />
            ))}

            {/* Days in Month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateObj = new Date(year, month, dayNum);
              const dateIsoStr = dateObj.toISOString().split('T')[0];
              const isToday = new Date().toDateString() === dateObj.toDateString();

              const dayEvts = filteredEvents.filter(e => {
                const sDate = new Date(e.start_time).toISOString().split('T')[0];
                return sDate === dateIsoStr;
              });

              return (
                <div
                  key={`day-${dayNum}`}
                  onClick={() => dayEvts.length > 0 && setSelectedDayEvents({ dayNumber: dayNum, dateStr: dateIsoStr, events: dayEvts })}
                  className={`h-24 sm:h-28 rounded-2xl border p-1.5 flex flex-col justify-between transition-all cursor-pointer ${
                    isToday ? 'bg-indigo-50/60 border-indigo-300 ring-2 ring-indigo-200' : 
                    dayEvts.length > 0 ? 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-xs' : 'bg-slate-50/50 border-slate-100'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-black ${isToday ? 'w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center' : 'text-slate-800'}`}>
                      {dayNum}
                    </span>
                    {dayEvts.length > 0 && (
                      <span className="text-[9px] font-black bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full">
                        {dayEvts.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-hidden">
                    {dayEvts.slice(0, 2).map(e => (
                      <div
                        key={e.id}
                        className="text-[9px] font-bold p-1 rounded-lg bg-indigo-600 text-white truncate shadow-2xs"
                        title={e.title}
                      >
                        {e.title}
                      </div>
                    ))}
                    {dayEvts.length > 2 && (
                      <div className="text-[8px] font-extrabold text-indigo-600 text-right pr-0.5">
                        +{dayEvts.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: PROGRAM LIST / AGENDA */}
      {(viewMode === 'agenda' || viewMode === 'calendar') && (
        <div className="space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <h3 className="font-extrabold text-slate-900 text-lg">Upcoming Program Roster</h3>
            <span className="text-xs text-slate-500 font-bold">{filteredEvents.length} Events Listed</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map(evt => {
              const startDate = new Date(evt.start_time);
              const endDate = new Date(evt.end_time);
              const userReg = getEventUserReg(evt);
              const isFull = (evt.registered_count || 0) >= (evt.max_attendees || 9999);

              return (
                <div key={evt.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
                  <div>
                    <div className="relative h-40 w-full bg-slate-900 overflow-hidden">
                      <img
                        src={evt.featured_image || 'https://images.unsplash.com/photo-1510525009512-ad7fc13eefab?auto=format&fit=crop&w=800&q=80'}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="px-2.5 py-0.5 bg-white/90 text-slate-900 rounded-full text-[10px] font-black uppercase tracking-wider">
                            {evt.category}
                          </span>
                          {(() => {
                            const rec = getRecurrenceBadge(evt.recurrence);
                            return (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 shadow-sm ${rec.badgeColor}`}>
                                <span>{rec.icon}</span>
                                <span>{rec.label}</span>
                              </span>
                            );
                          })()}
                        </div>
                        {userReg ? (
                          <span className={`px-2.5 py-0.5 text-white rounded-full text-[10px] font-black uppercase flex items-center gap-1 shadow-sm ${
                            userReg.status === 'waitlist' ? 'bg-amber-600' : 'bg-emerald-500'
                          }`}>
                            {userReg.status === 'waitlist' ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                            {userReg.status === 'waitlist' ? 'Waitlist Active' : 'Registered'}
                          </span>
                        ) : isFull ? (
                          <span className="px-2 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-black uppercase shadow-sm">
                            At Capacity
                          </span>
                        ) : null}
                      </div>

                      <div className="absolute bottom-3 left-3 text-white">
                        <p className="text-[11px] font-bold text-amber-300">
                          {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>

                    <div className="p-5 space-y-3">
                      <h4 className="font-black text-slate-900 text-base leading-snug">{evt.title}</h4>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{evt.description}</p>

                      <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
                        <div className="flex items-center gap-2 font-medium">
                          <Clock size={14} className="text-indigo-600 shrink-0" />
                          <span>{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-medium min-w-0">
                            <MapPin size={14} className="text-indigo-600 shrink-0" />
                            <span className="truncate">{evt.location}</span>
                          </div>
                          {evt.location && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evt.location)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors"
                              title="Open location in Google Maps"
                            >
                              <MapPin size={11} /> Open Maps
                            </a>
                          )}
                        </div>
                        {evt.recurrence_pattern && (
                          <div className="flex items-center gap-1.5 text-purple-700 font-bold text-[11px]">
                            <span>🔁</span>
                            <span className="truncate">{evt.recurrence_pattern}</span>
                          </div>
                        )}
                      </div>

                      {/* Dedicated Event Account Information Pill */}
                      {(() => {
                        const acc = getEventAccount(evt.id, evt.title, evt.recurring_funding_allowance);
                        return (
                          <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-slate-700">
                              <Landmark size={14} className="text-emerald-600 shrink-0" />
                              <span className="font-mono text-[11px] text-slate-900">{evt.account_number || acc.account_number}</span>
                            </div>
                            <span className="text-[10px] font-black text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-lg border border-emerald-200">
                              Target: SLE {(evt.recurring_funding_allowance || acc.target_budget).toLocaleString()}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleRSVPToggle(evt)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        userReg
                          ? userReg.status === 'waitlist'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : isFull
                          ? 'bg-amber-500 text-slate-950 hover:bg-amber-600 shadow-sm font-black'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                      }`}
                    >
                      {userReg ? (userReg.status === 'waitlist' ? <Clock size={14} /> : <Check size={14} />) : <Sparkles size={14} />}
                      <span>
                        {userReg
                          ? userReg.status === 'waitlist'
                            ? '⏳ Waitlisted'
                            : '✓ Reserved'
                          : isFull
                          ? '⏳ Join Waitlist'
                          : 'RSVP Seat'}
                      </span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {userReg && (
                        <button
                          onClick={() => setShowQRPass({ event: evt, reg: userReg })}
                          className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                          title="View My Event Check-In QR Pass"
                        >
                          <QrCode size={15} />
                          <span>QR Pass</span>
                        </button>
                      )}

                      <button
                        onClick={() => downloadICS(evt)}
                        title="Download .ics Calendar Invite"
                        className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 cursor-pointer"
                      >
                        <Download size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE 3: THIS WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h3 className="font-extrabold text-slate-900 text-lg border-b border-slate-100 pb-3">
            Grace Cathedral Weekly Worship Schedule
          </h3>

          <div className="space-y-3">
            {filteredEvents.map(evt => {
              const userReg = getEventUserReg(evt);
              const isFull = (evt.registered_count || 0) >= (evt.max_attendees || 9999);
              return (
                <div key={evt.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-300 transition-colors">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                      {new Date(evt.start_time).toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm">{evt.title}</h4>
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-black rounded uppercase">
                          {evt.category}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1"><Clock size={12} /> {new Date(evt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="flex items-center gap-1"><MapPin size={12} /> {evt.location}</span>
                        {evt.location && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evt.location)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                          >
                            Map &rarr;
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRSVPToggle(evt)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer self-start sm:self-auto shrink-0 ${
                      userReg 
                        ? userReg.status === 'waitlist' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                        : isFull ? 'bg-amber-500 text-slate-950 hover:bg-amber-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {userReg ? (userReg.status === 'waitlist' ? '⏳ Waitlisted' : '✓ Reserved') : isFull ? '⏳ Join Waitlist' : 'RSVP Seat'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DAY POPUP MODAL */}
      {selectedDayEvents && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  {selectedDayEvents.dateStr}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  Scheduled Programs ({selectedDayEvents.events.length})
                </h3>
              </div>
              <button onClick={() => setSelectedDayEvents(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {selectedDayEvents.events.map(evt => {
                const userReg = getEventUserReg(evt);
                const isFull = (evt.registered_count || 0) >= (evt.max_attendees || 9999);
                return (
                  <div key={evt.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-bold text-slate-900">{evt.title}</h4>
                      <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded shrink-0">
                        {evt.category}
                      </span>
                    </div>
                    <p className="text-slate-600 line-clamp-2">{evt.description}</p>
                    <div className="flex justify-between items-center text-slate-500 text-[11px] pt-1">
                      <div className="flex items-center gap-2">
                        <span><Clock size={12} className="inline mr-1 text-indigo-600" /> {new Date(evt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {evt.location && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evt.location)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 font-bold hover:underline"
                          >
                            Maps
                          </a>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          handleRSVPToggle(evt);
                          setSelectedDayEvents(null);
                        }}
                        className={`px-3 py-1 text-white rounded-lg font-bold transition-colors cursor-pointer ${
                          userReg ? 'bg-slate-700' : isFull ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        {userReg ? (userReg.status === 'waitlist' ? 'Waitlisted' : 'Reserved') : isFull ? 'Waitlist' : 'RSVP Seat'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Member Personal QR Check-In Pass Modal */}
      {showQRPass && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl text-center space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                Official Entry Pass
              </span>
              <button onClick={() => setShowQRPass(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div>
              <h4 className="font-extrabold text-slate-900 text-base">{showQRPass.event.title}</h4>
              <p className="text-xs text-slate-500 mt-0.5">Show this QR Code at sanctuary doors to check in</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-center shadow-inner">
              <QRCodeSVG 
                value={`EVENT:${showQRPass.event.id}:REG:${showQRPass.reg.id}`}
                size={180}
                level="H"
                includeMargin
              />
            </div>

            <div className="p-3 bg-indigo-50 rounded-2xl text-xs text-indigo-950 font-medium space-y-1 text-left">
              <p><strong>Attendee:</strong> {showQRPass.reg.member_name}</p>
              <p><strong>Venue:</strong> {showQRPass.event.location}</p>
              <p><strong>Date & Time:</strong> {new Date(showQRPass.event.start_time).toLocaleString()}</p>
              <p><strong>Status:</strong> <span className="uppercase font-bold text-emerald-700">{showQRPass.reg.status}</span></p>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer size={15} /> Print / Save Pass
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Congregation Live Sanctuary & Streaming Page ---

const StreamingPage = ({ profile }: { profile: Profile | null }) => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newChatText, setNewChatText] = useState('');
  const [viewerCount, setViewerCount] = useState(148);

  useEffect(() => {
    const loadStreams = async () => {
      const { data } = await supabase.from('streams').select('*').order('scheduled_start', { ascending: false });
      if (data && data.length > 0) {
        setStreams(data);
        const live = data.find(s => s.status === 'live') || data[0];
        setActiveStream(live);
      }
    };
    loadStreams();
  }, []);

  useEffect(() => {
    if (!activeStream) return;

    const loadChat = async () => {
      const { data } = await supabase
        .from('stream_chat_messages')
        .select('*')
        .eq('stream_id', activeStream.id)
        .order('created_at', { ascending: true });
      if (data) setMessages(data as ChatMessage[]);
    };
    loadChat();

    const channel = supabase.channel(`stream_chat:${activeStream.id}`);
    channel
      .on('postgres_changes', { event: 'INSERT', filter: `stream_id=eq.${activeStream.id}` }, (payload: any) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeStream?.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatText.trim() || !activeStream || !profile) return;

    const messageText = newChatText.trim();
    setNewChatText('');

    const newMsg: ChatMessage = {
      id: `chat_${Date.now()}`,
      stream_id: activeStream.id,
      user_id: profile.id,
      message: messageText,
      created_at: new Date().toISOString(),
      profile: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        avatar_url: profile.avatar_url,
        primary_role: profile.primary_role
      }
    };

    setMessages(prev => [...prev, newMsg]);

    await supabase.from('stream_chat_messages').insert({
      stream_id: activeStream.id,
      user_id: profile.id,
      message: messageText
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-xs font-black uppercase tracking-wider text-rose-600">
              Grace Cathedral Live Broadcast
            </span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight mt-1">Live Sanctuary Stream</h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3.5 py-1.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-1.5">
            <Radio size={14} className="animate-pulse" />
            <span>{viewerCount} Worshippers Online</span>
          </span>
        </div>
      </div>

      {activeStream ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="aspect-video w-full bg-slate-950 rounded-3xl overflow-hidden shadow-2xl relative border border-slate-800">
              {activeStream.embed_url ? (
                <iframe 
                  src={activeStream.embed_url} 
                  className="w-full h-full"
                  title="Sanctuary Stream"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center mb-4">
                    <Video size={36} className="text-indigo-400" />
                  </div>
                  <h3 className="text-2xl font-black mb-2">{activeStream.title}</h3>
                  <p className="text-indigo-200 text-sm max-w-md mb-6">{activeStream.description || "The service will begin shortly. Prepare your heart for worship."}</p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-md text-xs font-bold">
                    <Clock size={14} /> Scheduled: {new Date(activeStream.scheduled_start).toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-700">
                  {activeStream.status}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {new Date(activeStream.scheduled_start).toLocaleDateString()}
                </span>
              </div>
              <h3 className="text-2xl font-black text-slate-900">{activeStream.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{activeStream.description}</p>
            </div>
          </div>

          {/* Live Chat Panel */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[580px] overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <MessageSquare size={16} className="text-indigo-600" />
                Sanctuary Live Chat
              </h4>
              <span className="text-[10px] font-bold text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded">
                Live
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className="flex gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {msg.profile?.avatar_url ? (
                      <img src={msg.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (msg.profile?.first_name?.[0] || 'U')
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        {msg.profile?.first_name} {msg.profile?.last_name}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 mt-0.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {msg.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-100 bg-white flex gap-2">
              <input 
                type="text" 
                placeholder="Share an Amen, prayer, or greeting..." 
                className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                value={newChatText}
                onChange={(e) => setNewChatText(e.target.value)}
              />
              <button 
                type="submit"
                disabled={!newChatText.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center cursor-pointer"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400">No scheduled streams available at this time.</div>
      )}
    </div>
  );
};

// --- Member Profile & Account Settings Page with Spiritual Milestones ---

const printHtmlDocument = (htmlContent: string) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1500);
    }
  };

  if (doc.readyState === 'complete') {
    setTimeout(triggerPrint, 120);
  } else {
    iframe.onload = () => setTimeout(triggerPrint, 120);
  }
};

const ProfilePage = ({ profile }: { profile: Profile | null }) => {
  const [churchProfile, setChurchProfile] = useState(() => getChurchProfile());

  useEffect(() => {
    const handleProfileUpdate = () => setChurchProfile(getChurchProfile());
    window.addEventListener('church-profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('church-profile-updated', handleProfileUpdate);
  }, []);

  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [dobInput, setDobInput] = useState(profile?.date_of_birth || '1996-10-30');
  const [maritalStatusInput, setMaritalStatusInput] = useState<'Single' | 'Married' | 'Widowed' | 'Divorced'>(profile?.marital_status || 'Single');
  const [marriageDateInput, setMarriageDateInput] = useState(profile?.marriage_date || '2021-10-25');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [confirmResetData, setConfirmResetData] = useState(false);

  // Milestones State
  const [milestones, setMilestones] = useState({
    baptismDate: profile?.baptism_date || '2022-10-17',
    baptizedBy: profile?.baptized_by || 'Rev. Sarah Johnson',
    membershipDate: profile?.membership_date || '2022-05-01',
    communionConfirmed: true,
    achievements: [
      { id: 'm1', title: 'Water & Holy Spirit Baptism', date: 'October 2022', icon: Sparkles, badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
      { id: 'm2', title: 'Grace Cathedral Covenant Member', date: 'May 2022', icon: ShieldCheck, badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
      { id: 'm3', title: 'Kingdom Leadership Certification', date: 'November 2024', icon: Award, badgeColor: 'bg-amber-100 text-amber-700 border-amber-200' },
      { id: 'm4', title: 'Faithful Tithe Steward 2025', date: 'January 2025', icon: Trophy, badgeColor: 'bg-purple-100 text-purple-700 border-purple-200' }
    ]
  });

  const [editMilestonesModal, setEditMilestonesModal] = useState(false);
  const [certificateModal, setCertificateModal] = useState(false);
  const [idCardModal, setIdCardModal] = useState(false);
  const [milestonesSaving, setMilestonesSaving] = useState(false);
  const [bDateInput, setBDateInput] = useState(milestones.baptismDate);
  const [mDateInput, setMDateInput] = useState(milestones.membershipDate);
  const [bByInput, setBByInput] = useState(milestones.baptizedBy);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name || '');
    setLastName(profile.last_name || '');
    setPhone(profile.phone || '');
    setDobInput(profile.date_of_birth || '1996-10-30');
    setMaritalStatusInput(profile.marital_status || 'Single');
    setMarriageDateInput(profile.marriage_date || '2021-10-25');
    setAvatarError(false);

    const nextBaptism = profile.baptism_date || '2022-10-17';
    const nextBaptizedBy = profile.baptized_by || 'Rev. Sarah Johnson';
    const nextMembership = profile.membership_date || '2022-05-01';
    setBDateInput(nextBaptism);
    setBByInput(nextBaptizedBy);
    setMDateInput(nextMembership);
    setMilestones(prev => ({
      ...prev,
      baptismDate: nextBaptism,
      baptizedBy: nextBaptizedBy,
      membershipDate: nextMembership
    }));
  }, [profile]);

  const displayFirstName = firstName || profile?.first_name || 'Faithful';
  const displayLastName = lastName || profile?.last_name || 'Member';
  const displayInitials = `${displayFirstName[0] || 'F'}${displayLastName[0] || 'M'}`.toUpperCase();
  const formattedRole = (profile?.primary_role || 'member').replace(/_/g, ' ');
  const campusLabel = churchProfile.subtle_title || churchProfile.name || 'Grace Cathedral';

  // Dedicated Print Function for Baptism Certificate
  const handlePrintCertificate = () => {
    const cp = churchProfile;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Certificate of Holy Baptism - ${displayFirstName} ${displayLastName}</title>
          <style>
            @page { size: A4 landscape; margin: 15mm; }
            body {
              font-family: Georgia, serif;
              margin: 0; padding: 0;
              background: #ffffff; color: #1e293b;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .cert-card {
              border: 10px double #b45309;
              padding: 40px;
              background: #fffbeb;
              text-align: center;
              border-radius: 12px;
              box-sizing: border-box;
              min-height: 85vh;
              position: relative;
              display: flex; flex-direction: column; justify-content: space-between;
            }
            .logo-top-left {
              position: absolute;
              top: 25px;
              left: 25px;
              width: 60px;
              height: 60px;
              border-radius: 50%;
              border: 2px solid #d97706;
              overflow: hidden;
              background: #ffffff;
              display: flex; align-items: center; justify-content: center;
              font-size: 24px; color: #b45309;
            }
            .logo-top-right {
              position: absolute;
              top: 25px;
              right: 25px;
              width: 60px;
              height: 60px;
              border-radius: 50%;
              border: 2px solid #d97706;
              overflow: hidden;
              background: #ffffff;
              display: flex; align-items: center; justify-content: center;
              font-size: 24px; color: #b45309;
            }
            .header-title { font-size: 26px; font-weight: bold; text-transform: uppercase; color: #78350f; font-family: system-ui, sans-serif; }
            .subtitle { font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 2px; font-family: system-ui, sans-serif; margin-top: 4px; }
            .cert-title { font-size: 38px; font-weight: 900; color: #78350f; margin: 20px 0 10px 0; border-bottom: 2px solid #fde68a; display: inline-block; padding-bottom: 5px; }
            .scripture { font-style: italic; color: #475569; font-size: 13px; max-width: 600px; margin: 10px auto; line-height: 1.6; }
            .cert-name { font-size: 38px; font-weight: bold; color: #0f172a; margin: 18px 0; border-bottom: 2px solid #f59e0b; display: inline-block; padding: 0 40px; }
            .details { font-size: 13px; color: #334155; margin: 10px 0; }
            .date { font-size: 18px; font-weight: bold; color: #78350f; margin-top: 5px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 40px; border-top: 1px solid #fde68a; padding-top: 25px; }
            .sig-box { text-align: center; font-family: system-ui, sans-serif; }
            .sig-line { border-bottom: 1px solid #64748b; height: 30px; margin-bottom: 6px; font-style: italic; font-size: 16px; font-family: Georgia, serif; }
            .sig-label { font-size: 10px; text-transform: uppercase; font-weight: bold; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="cert-card">
            <div class="logo-top-left">
              ${cp.logo_url ? `<img src="${cp.logo_url}" alt="Church Logo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : 'FC'}
            </div>
            <div class="logo-top-right">
              ${cp.logo_url ? `<img src="${cp.logo_url}" alt="Church Logo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : 'FC'}
            </div>

            <div>
              <div class="header-title">${cp.subtle_title || cp.name}</div>
              <div class="subtitle">Church of Faith & Christian Fellowship</div>
              <h1 class="cert-title">Certificate of Holy Baptism</h1>
              <p class="scripture">
                "Therefore we are buried with Him by baptism into death: that like as Christ was raised up from the dead by the glory of the Father, even so we also should walk in newness of life."
                <br><strong>— Romans 6:4</strong>
              </p>
              <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-top: 20px;">This certifies that</p>
              <div class="cert-name">${displayFirstName} ${displayLastName}</div>
              <p class="details">Having publicly professed faith in our Lord and Savior Jesus Christ, was baptized by immersion on</p>
              <div class="date">${new Date(milestones.baptismDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            </div>

            <div class="signatures">
              <div class="sig-box">
                <div class="sig-line">${milestones.baptizedBy || 'Officiating Minister'}</div>
                <div class="sig-label">Officiating Minister</div>
              </div>
              <div class="sig-box">
                <div class="sig-line">${cp.senior_pastor || 'Senior Pastor'}</div>
                <div class="sig-label">Senior Pastor, ${cp.subtle_title || cp.name}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    printHtmlDocument(htmlContent);
  };

  // Dedicated Print Function for Member ID Card
  const handlePrintIdCard = () => {
    const cp = churchProfile;
    const memberIdCode = `FC-MEM-${(profile?.id || '1024').slice(0, 8).toUpperCase()}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Member ID Card - ${displayFirstName} ${displayLastName}</title>
          <style>
            @page { size: 85.6mm 54mm; margin: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              margin: 0; padding: 20px; background: #ffffff; color: #0f172a;
              display: flex; flex-direction: column; align-items: center; gap: 20px;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .id-card {
              width: 320px; height: 200px;
              border-radius: 16px;
              border: 1px solid #cbd5e1;
              background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
              color: #ffffff;
              padding: 16px;
              box-sizing: border-box;
              position: relative;
              overflow: hidden;
              display: flex; flex-direction: column; justify-content: space-between;
            }
            .card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 8px; }
            .church-name { font-size: 13px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #f8fafc; }
            .card-tag { font-size: 8px; font-weight: 800; background: #4f46e5; color: #ffffff; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
            .card-body { display: flex; gap: 12px; align-items: center; margin-top: 4px; }
            .avatar { width: 56px; height: 56px; border-radius: 12px; background: #e0e7ff; border: 2px solid #818cf8; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #3730a3; font-weight: 900; font-size: 18px; }
            .avatar img { width: 100%; height: 100%; object-fit: cover; }
            .member-info h4 { font-size: 15px; font-weight: 900; margin: 0 0 2px 0; color: #ffffff; }
            .member-info p { font-size: 10px; color: #c7d2fe; margin: 1px 0; }
            .role-badge { font-size: 9px; font-weight: 800; color: #34d399; text-transform: uppercase; letter-spacing: 0.5px; }
            .card-footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 8px; font-size: 9px; color: #a5b4fc; }
            .id-code { font-family: monospace; font-size: 11px; font-weight: bold; color: #facc15; }
          </style>
        </head>
        <body>
          <div class="id-card">
            <div class="card-header">
              <div class="church-name">${cp.subtle_title || cp.name}</div>
              <div class="card-tag">Official ID</div>
            </div>
            <div class="card-body">
              <div class="avatar">
                ${profile?.avatar_url ? `<img src="${profile.avatar_url}" alt="Member Photo" />` : displayInitials}
              </div>
              <div class="member-info">
                <div class="role-badge">${formattedRole || 'COVENANT MEMBER'}</div>
                <h4>${displayFirstName} ${displayLastName}</h4>
                <p>${profile?.email || 'member@faithconnect.church'}</p>
                <p>Phone: ${phone || profile?.phone || 'Verified'}</p>
              </div>
            </div>
            <div class="card-footer">
              <div>
                <div>MEMBER ID NO</div>
                <div class="id-code">${memberIdCode}</div>
              </div>
              <div style="text-align: right;">
                <div>ISSUED YEAR</div>
                <div style="color: #ffffff; font-weight: bold;">${new Date().getFullYear()}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    printHtmlDocument(htmlContent);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!firstName.trim() || !lastName.trim()) {
      setSaveError('First name and last name are required.');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    const updatedProfileData = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      date_of_birth: dobInput || undefined,
      marital_status: maritalStatusInput,
      marriage_date: maritalStatusInput === 'Married' ? marriageDateInput : undefined,
      baptism_date: bDateInput,
      baptized_by: bByInput,
      membership_date: mDateInput
    };

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updatedProfileData)
        .eq('id', profile.id);

      if (error) {
        console.error('Unable to update member profile:', error);
        setSaveError('Could not save profile changes right now. Please try again.');
        setSaving(false);
        return;
      }

      window.dispatchEvent(new CustomEvent('profile-updated', {
        detail: { id: profile.id, ...updatedProfileData }
      }));
      setSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (error) {
      console.error('Unable to update member profile:', error);
      setSaveError('An unexpected error occurred while updating your profile.');
      setSaving(false);
    }
  };

  const handleSaveMilestones = async (e: React.FormEvent) => {
    e.preventDefault();
    setMilestonesSaving(true);
    setSaveError(null);

    const nextMilestones = {
      baptismDate: bDateInput,
      membershipDate: mDateInput,
      baptizedBy: bByInput.trim() || 'Rev. Sarah Johnson'
    };

    if (profile) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            baptism_date: nextMilestones.baptismDate,
            baptized_by: nextMilestones.baptizedBy,
            membership_date: nextMilestones.membershipDate
          })
          .eq('id', profile.id);

        if (error) {
          console.error('Unable to update milestones:', error);
          setSaveError('Could not save spiritual milestones.');
          setMilestonesSaving(false);
          return;
        }

        window.dispatchEvent(new CustomEvent('profile-updated', {
          detail: {
            id: profile.id,
            baptism_date: nextMilestones.baptismDate,
            baptized_by: nextMilestones.baptizedBy,
            membership_date: nextMilestones.membershipDate
          }
        }));
      } catch (err) {
        console.error('Unable to update milestones:', err);
        setSaveError('An unexpected error occurred while saving milestones.');
        setMilestonesSaving(false);
        return;
      }
    }

    setMilestones(prev => ({
      ...prev,
      ...nextMilestones
    }));
    setMilestonesSaving(false);
    setEditMilestonesModal(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  // Calculate membership years safely
  const parsedJoinYear = new Date(milestones.membershipDate).getFullYear();
  const joinYear = Number.isNaN(parsedJoinYear) ? new Date().getFullYear() : parsedJoinYear;
  const currentYear = new Date().getFullYear();
  const yearsInFellowship = Math.max(1, currentYear - joinYear);
  const overallSpiritualGrowth = 85;
  const formattedBaptismDate = Number.isNaN(Date.parse(milestones.baptismDate))
    ? milestones.baptismDate
    : new Date(milestones.baptismDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const formattedMembershipDate = Number.isNaN(Date.parse(milestones.membershipDate))
    ? milestones.membershipDate
    : new Date(milestones.membershipDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const discipleshipPillars = [
    { label: 'Water Baptism', status: 'Completed', pct: 100, barClass: 'bg-emerald-400', textClass: 'text-emerald-300', icon: CheckCircle2 },
    { label: 'Covenant Membership', status: 'Confirmed', pct: 100, barClass: 'bg-emerald-400', textClass: 'text-emerald-300', icon: ShieldCheck },
    { label: 'Discipleship & Communion', status: 'Active Learner', pct: 75, barClass: 'bg-amber-400', textClass: 'text-amber-300', icon: BookOpen },
    { label: 'Ministry Servant Leadership', status: 'In Training', pct: 60, barClass: 'bg-indigo-400', textClass: 'text-indigo-200', icon: Sparkles }
  ];

  return (
    <div className="space-y-5 sm:space-y-6 pb-20 md:pb-12">
      {/* Unified Member Identity Header & Credential Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-indigo-50 border border-indigo-200 overflow-hidden flex items-center justify-center text-indigo-700 font-black text-xl sm:text-2xl shrink-0">
              {profile?.avatar_url && !avatarError ? (
                <img
                  src={profile.avatar_url}
                  alt={`${displayFirstName} ${displayLastName}`}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{displayInitials}</span>
              )}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-semibold">
                <span className="text-indigo-700 font-bold">Member Account</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize">{formattedRole}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{yearsInFellowship} {yearsInFellowship === 1 ? 'Year' : 'Years'} Covenant Member</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                My Profile & Spiritual Journey
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                Manage personal contact records, household dates, baptism credentials, and discipleship milestones at {campusLabel}.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIdCardModal(true)}
              className="min-h-[40px] px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/70 text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <CreditCard size={15} className="shrink-0" />
              <span>Member ID Card</span>
            </button>

            <button
              type="button"
              onClick={() => setCertificateModal(true)}
              className="min-h-[40px] px-4 py-2 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/70 text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Printer size={15} className="shrink-0" />
              <span>Baptism Certificate</span>
            </button>

            <button
              type="button"
              onClick={() => setEditMilestonesModal(true)}
              className="min-h-[40px] px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Edit size={14} className="shrink-0" />
              <span>Edit Milestones</span>
            </button>
          </div>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>Profile and milestone details updated successfully.</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccess(false)}
            className="p-1 text-emerald-700 hover:text-emerald-900 cursor-pointer shrink-0"
            aria-label="Dismiss confirmation"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {saveError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{saveError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="p-1 text-rose-700 hover:text-rose-900 cursor-pointer shrink-0"
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Multi-Breakpoint Workspace: 1-Col Mobile -> Tablet 2-Col Side Cards -> Desktop 12-Col Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* LEFT PRIMARY COLUMN (7 cols on xl+): Personal Details Form + Service Recognitions */}
        <div className="xl:col-span-7 space-y-5 sm:space-y-6 min-w-0">
          <form
            onSubmit={handleUpdate}
            className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-6 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <User className="text-indigo-600 shrink-0" size={19} />
                <div className="min-w-0">
                  <h3 className="text-base font-black text-slate-900">Personal & Contact Information</h3>
                  <p className="text-xs text-slate-500">Keep your directory name, phone, birthday, and marital details current.</p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-500 truncate max-w-full">
                {profile?.email || 'member@faithconnect.church'}
              </span>
            </div>

            {/* Identity & Contact Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">First Name *</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5">Last Name *</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+232 76 000 000"
                  className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-900 tabular-nums focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5">Portal Email</label>
                <input
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm sm:text-xs font-mono text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Household & Life Dates */}
            <div className="pt-5 border-t border-slate-100 space-y-4">
              <div>
                <h4 className="text-sm font-black text-slate-900">Birth Date & Marital Details</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Used for pastoral care, birthday greetings, and family anniversary prayers.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">Date of Birth</label>
                  <input
                    type="date"
                    value={dobInput}
                    onChange={(e) => setDobInput(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-900 tabular-nums focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">Marital Status</label>
                  <select
                    value={maritalStatusInput}
                    onChange={(e) => setMaritalStatusInput(e.target.value as 'Single' | 'Married' | 'Widowed' | 'Divorced')}
                    className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                  >
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Divorced">Divorced</option>
                  </select>
                </div>

                {maritalStatusInput === 'Married' && (
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1.5">Wedding / Marriage Anniversary Date</label>
                    <input
                      type="date"
                      value={marriageDateInput}
                      onChange={(e) => setMarriageDateInput(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-900 tabular-nums focus:bg-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Portal Role & Ministry Assignment */}
            <div className="pt-5 border-t border-slate-100 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">Assigned System Role</label>
                  <input
                    type="text"
                    disabled
                    value={formattedRole.toUpperCase()}
                    className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-500 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">Ministry Department</label>
                  <input
                    type="text"
                    disabled
                    value={profile?.assigned_department || profile?.department_name || 'General Congregation'}
                    className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                System permissions and department assignments are managed by your Lead Pastor or Church Admin.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">
                Changes sync across your directory profile and digital credentials.
              </span>
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto min-h-[42px] px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Check size={15} />
                <span>{saving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>

          {/* Service Recognitions & Covenant Badges */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Special Recognitions & Service Badges</h3>
                <p className="text-xs text-slate-500">Ministry certifications and covenant milestones awarded during your fellowship.</p>
              </div>
              <span className="text-xs font-bold text-slate-500 tabular-nums shrink-0">
                {milestones.achievements.length} earned
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {milestones.achievements.map(ach => (
                <div key={ach.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${ach.badgeColor}`}>
                    <ach.icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-xs truncate">{ach.title}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">Awarded {ach.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT SIDE COLUMN (5 cols on xl+): 2-Col Side-by-Side on Tablet/Laptop (md–lg), Stacked Sidebar on xl+ */}
        <div className="xl:col-span-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-5 sm:gap-6 min-w-0">
          {/* Spiritual Progression Matrix */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 sm:p-6 text-white space-y-5 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row md:flex-col 2xl:flex-row items-center sm:items-start md:items-center 2xl:items-start gap-5">
              {/* SVG Donut Chart */}
              <div className="relative w-36 h-36 sm:w-40 sm:h-40 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-indigo-950/80"
                    strokeWidth="3.8"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-amber-400 transition-all duration-700 ease-out"
                    strokeDasharray={`${overallSpiritualGrowth}, 100`}
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center text-center">
                  <span className="text-3xl font-black text-amber-300 tracking-tight tabular-nums">{overallSpiritualGrowth}%</span>
                  <span className="text-[10px] font-bold tracking-wider text-indigo-200 uppercase">Growth</span>
                </div>
              </div>

              <div className="min-w-0 space-y-1.5 text-center sm:text-left md:text-center 2xl:text-left">
                <p className="text-[11px] font-bold text-amber-300 tracking-wide">Discipleship Journey</p>
                <h3 className="text-lg sm:text-xl font-black text-white">Spiritual Progression Matrix</h3>
                <p className="text-xs text-indigo-200 leading-relaxed">
                  Your Christian growth milestones mapped across core discipleship pillars at {campusLabel}.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-1 border-t border-white/10">
              {discipleshipPillars.map((pillar) => {
                const IconComp = pillar.icon;
                return (
                  <div key={pillar.label} className="pt-2 first:pt-3">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold mb-1.5">
                      <span className="text-indigo-100 flex items-center gap-1.5 min-w-0 truncate">
                        <IconComp size={13} className="shrink-0 opacity-90" />
                        <span className="truncate">{pillar.label}</span>
                      </span>
                      <span className={`${pillar.textClass} tabular-nums whitespace-nowrap shrink-0`}>
                        {pillar.pct}% ({pillar.status})
                      </span>
                    </div>
                    <div className="w-full bg-indigo-950/90 h-2 rounded-full overflow-hidden">
                      <div className={`${pillar.barClass} h-full rounded-full`} style={{ width: `${pillar.pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Spiritual Milestones & Credentials */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Trophy size={19} className="text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-base font-black text-slate-900">Milestones & Credentials</h3>
                  <p className="text-xs text-slate-500">Baptism records, membership date, and printable ID.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditMilestonesModal(true)}
                className="min-h-[36px] px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Update
              </button>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-4 bg-white space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-500">Water Baptism</span>
                  <span className="text-xs font-bold text-emerald-700">Completed</span>
                </div>
                <div>
                  <p className="text-base font-black text-slate-900 tabular-nums">{formattedBaptismDate}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Officiated by <strong className="text-slate-700">{milestones.baptizedBy}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCertificateModal(true)}
                  className="w-full min-h-[40px] px-3.5 py-2 bg-amber-50 border border-amber-200/80 text-amber-800 hover:bg-amber-100 text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <FileText size={14} className="shrink-0" />
                  <span>View & Download Certificate</span>
                </button>
              </div>

              <div className="p-4 bg-white space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-500">Church Membership</span>
                  <span className="text-xs font-bold text-indigo-700 tabular-nums">{yearsInFellowship} {yearsInFellowship === 1 ? 'Year' : 'Years'} Active</span>
                </div>
                <div>
                  <p className="text-base font-black text-slate-900 tabular-nums">{formattedMembershipDate}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{campusLabel} Covenant Member</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIdCardModal(true)}
                  className="w-full min-h-[40px] px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <CreditCard size={14} className="shrink-0" />
                  <span>View & Print Digital Member ID</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Formal Baptism Certificate Modal */}
      {certificateModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-start justify-center p-3 sm:p-6 pt-16 sm:pt-20 pb-12 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 max-w-2xl w-full shadow-2xl border border-amber-200 my-auto space-y-5 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2 min-w-0">
                <Award size={22} className="text-amber-600 shrink-0" />
                <h3 className="font-black text-slate-900 text-base sm:text-lg truncate">Official Church Baptism Certificate</h3>
              </div>
              <div className="flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePrintCertificate}
                  className="min-h-[40px] px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Printer size={14} /> Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setCertificateModal(false)}
                  className="min-h-[40px] min-w-[40px] p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer inline-flex items-center justify-center"
                  aria-label="Close certificate preview"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Certificate Preview Modal Area */}
            <div id="printable-certificate" className="border-4 sm:border-8 border-double border-amber-600/70 bg-gradient-to-b from-amber-50/40 via-white to-amber-50/30 p-5 sm:p-10 rounded-2xl text-center space-y-5 relative font-serif shadow-inner">
              <div className="hidden sm:block absolute top-4 left-4 w-10 h-10 border-t-2 border-l-2 border-amber-600/60 pointer-events-none" />
              <div className="hidden sm:block absolute top-4 right-4 w-10 h-10 border-t-2 border-r-2 border-amber-600/60 pointer-events-none" />
              <div className="hidden sm:block absolute bottom-4 left-4 w-10 h-10 border-b-2 border-l-2 border-amber-600/60 pointer-events-none" />
              <div className="hidden sm:block absolute bottom-4 right-4 w-10 h-10 border-b-2 border-r-2 border-amber-600/60 pointer-events-none" />

              {/* Church Seal / Branding */}
              <div className="flex flex-col items-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-amber-100 rounded-full border-2 border-amber-500/80 flex items-center justify-center text-amber-800 shadow-md mb-2 overflow-hidden">
                  {churchProfile.logo_url ? (
                    <img src={churchProfile.logo_url} alt="Logo" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <Church size={28} />
                  )}
                </div>
                <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-wider uppercase font-sans">
                  {campusLabel}
                </h2>
                <p className="text-[11px] sm:text-xs uppercase font-bold text-amber-800 tracking-widest font-sans mt-0.5">
                  Church of Faith & Christian Fellowship
                </p>
              </div>

              <div className="py-1">
                <h1 className="text-xl sm:text-3xl font-extrabold text-amber-900 font-serif tracking-tight border-b-2 border-amber-300 inline-block pb-1 px-4 sm:px-6">
                  Certificate of Holy Baptism
                </h1>
              </div>

              <p className="text-xs sm:text-sm italic text-slate-600 max-w-md mx-auto leading-relaxed">
                "Therefore we are buried with Him by baptism into death: that like as Christ was raised up from the dead by the glory of the Father, even so we also should walk in newness of life."
                <span className="block font-bold text-amber-800 not-italic text-xs mt-1">— Romans 6:4</span>
              </p>

              <div className="py-2 sm:py-3 space-y-2.5">
                <p className="text-xs font-sans uppercase tracking-widest text-slate-500">This certifies that</p>
                <p className="text-2xl sm:text-4xl font-extrabold text-slate-900 font-serif border-b border-amber-400/80 inline-block px-4 sm:px-8 py-1 break-words max-w-full">
                  {displayFirstName} {displayLastName}
                </p>
                <p className="text-xs text-slate-600 max-w-md mx-auto pt-1">
                  Having publicly professed faith in our Lord and Savior Jesus Christ, was baptized by immersion on
                </p>
                <p className="text-base sm:text-lg font-bold text-amber-900 font-sans tabular-nums">
                  {formattedBaptismDate}
                </p>
              </div>

              {/* Signatures */}
              <div className="pt-6 border-t border-amber-200/80 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 text-center font-sans">
                <div>
                  <div className="border-b border-slate-400 pb-1 font-serif italic text-slate-800 text-sm">
                    {milestones.baptizedBy || 'Officiating Minister'}
                  </div>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mt-1">Officiating Minister</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-1 font-serif italic text-slate-800 text-sm">
                    {churchProfile.senior_pastor || 'Senior Pastor'}
                  </div>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mt-1">Senior Pastor, {campusLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official Member ID Card Modal */}
      {idCardModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-7 max-w-lg w-full shadow-2xl border border-indigo-200 space-y-5 my-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck size={20} className="text-indigo-600 shrink-0" />
                <h3 className="font-black text-slate-900 text-base sm:text-lg truncate">Official Church Member ID Card</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePrintIdCard}
                  className="min-h-[38px] px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Printer size={14} /> Print ID
                </button>
                <button
                  type="button"
                  onClick={() => setIdCardModal(false)}
                  className="min-h-[38px] min-w-[38px] p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer inline-flex items-center justify-center"
                  aria-label="Close ID card preview"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ID CARD PREVIEW */}
            <div className="space-y-4">
              <div className="w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 rounded-2xl p-4 sm:p-6 text-white shadow-xl border border-indigo-500/30 relative overflow-hidden space-y-4">
                {/* Card Header */}
                <div className="flex justify-between items-start gap-3 border-b border-indigo-800/80 pb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 font-bold overflow-hidden shrink-0">
                      {churchProfile.logo_url ? (
                        <img src={churchProfile.logo_url} alt="Church Logo" className="w-full h-full object-cover" />
                      ) : (
                        <Church size={18} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-black text-sm tracking-wide text-white uppercase truncate">{campusLabel}</h4>
                      <p className="text-[10px] text-indigo-300 font-semibold uppercase tracking-wider truncate">Church Member Credential</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 shrink-0 whitespace-nowrap">
                    Active Member
                  </span>
                </div>

                {/* Card Main Body */}
                <div className="flex items-center gap-3.5 sm:gap-4 py-1">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-indigo-900/60 border-2 border-indigo-400/50 overflow-hidden flex items-center justify-center text-indigo-200 font-black text-xl sm:text-2xl shrink-0">
                    {profile?.avatar_url && !avatarError ? (
                      <img
                        src={profile.avatar_url}
                        alt={`${displayFirstName} ${displayLastName}`}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarError(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{displayInitials}</span>
                    )}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 truncate">
                      {formattedRole || 'COVENANT MEMBER'}
                    </p>
                    <h3 className="font-extrabold text-base sm:text-lg text-white truncate">{displayFirstName} {displayLastName}</h3>
                    <p className="text-xs text-indigo-200 truncate">{profile?.email || 'member@faithconnect.church'}</p>
                    <p className="text-[11px] text-indigo-300 font-mono tabular-nums truncate">Phone: {phone || profile?.phone || 'Verified'}</p>
                  </div>
                </div>

                {/* Card Footer with QR Code & ID Code */}
                <div className="flex justify-between items-end gap-3 border-t border-indigo-800/80 pt-3">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 block">Member ID Number</span>
                    <span className="font-mono text-xs font-black text-amber-300 tracking-wider tabular-nums block truncate">
                      FC-MEM-{(profile?.id || '1024').slice(0, 8).toUpperCase()}
                    </span>
                    <div className="text-[10px] text-slate-300 mt-1 tabular-nums">Joined: {formattedMembershipDate}</div>
                  </div>
                  <div className="p-1.5 bg-white rounded-xl shadow-md border border-indigo-100 flex items-center justify-center shrink-0">
                    <QRCodeSVG
                      value={`https://faithconnect.church/verify-member?id=${profile?.id || 'demo'}`}
                      size={52}
                      level="M"
                    />
                  </div>
                </div>
              </div>

              {/* CARD REVERSE PREVIEW */}
              <div className="w-full bg-slate-100 rounded-2xl p-4 border border-slate-300 text-slate-700 text-xs space-y-3">
                <div className="w-full h-7 bg-slate-900 rounded-lg flex items-center px-3 text-[10px] font-mono text-slate-400 overflow-hidden select-none">
                  |||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]">
                  <div className="break-words">
                    <strong>Sanctuary Hotline:</strong> {churchProfile.phone}
                  </div>
                  <div className="break-all sm:text-right">
                    <strong>Official Email:</strong> {churchProfile.email}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 text-center border-t border-slate-200 pt-2">
                  This card certifies covenant membership at {churchProfile.name}. Present for sanctuary entry, communion, and church governance.
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIdCardModal(false)}
                className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePrintIdCard}
                className="w-full sm:flex-1 min-h-[42px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Printer size={16} /> Print Official ID Card / Badge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Milestones Modal */}
      {editMilestonesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Update Spiritual Milestones</h3>
              <button
                type="button"
                onClick={() => setEditMilestonesModal(false)}
                className="min-h-[36px] min-w-[36px] p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer inline-flex items-center justify-center"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveMilestones} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">Water Baptism Date</label>
                <input
                  type="date"
                  value={bDateInput}
                  onChange={(e) => setBDateInput(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-900 tabular-nums focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">Baptism Officiating Pastor</label>
                <input
                  type="text"
                  value={bByInput}
                  onChange={(e) => setBByInput(e.target.value)}
                  placeholder="e.g. Rev. Sarah Johnson"
                  className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">{campusLabel} Membership Date</label>
                <input
                  type="date"
                  value={mDateInput}
                  onChange={(e) => setMDateInput(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm sm:text-xs font-bold text-slate-900 tabular-nums focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditMilestonesModal(false)}
                  className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={milestonesSaving}
                  className="w-full sm:w-auto min-h-[40px] px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {milestonesSaving ? 'Saving...' : 'Save Milestones'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline Sample Data Reset Control */}
      <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
        {confirmResetData ? (
          <>
            <span className="text-slate-600 font-semibold">Reset local sample data and reload?</span>
            <button
              type="button"
              onClick={() => resetLocalDatabase()}
              className="min-h-[36px] px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg cursor-pointer"
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetData(false)}
              className="min-h-[36px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmResetData(true)}
            className="min-h-[36px] px-3 py-1.5 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg font-bold cursor-pointer transition-colors"
          >
            Reset Sample Data & Reload
          </button>
        )}
      </div>
    </div>
  );
};

// --- Landing Page ---

const LandingPage = ({ 
  profile, 
  session 
}: { 
  profile: Profile | null; 
  session: any;
}) => {
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <Navbar 
        profile={profile} 
        onOpenAuth={(isSignUp) => setAuthModal(isSignUp ? 'signup' : 'signin')} 
      />

      {/* Hero Section */}
      <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-8">
          <Sparkles size={14} /> FaithConnect Grace Cathedral • Single Church Edition
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight max-w-4xl mx-auto leading-tight">
          Connecting Congregations Through <span className="text-indigo-600">Faith, Fellowship & Ministry</span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-600 mt-6 max-w-2xl mx-auto leading-relaxed">
          The all-in-one platform for Grace Cathedral: manage membership, ministries & teams, tithes & offerings, and live sanctuary streaming.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          {session ? (
            <>
              <button 
                type="button"
                onClick={() => navigate('/portal')} 
                className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white rounded-2xl text-lg font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer"
              >
                Launch Member Portal <ArrowRight size={20} />
              </button>
              <button 
                type="button"
                onClick={() => navigate('/portal/streaming')} 
                className="w-full sm:w-auto px-8 py-4 bg-slate-100 text-slate-800 rounded-2xl text-lg font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Watch Sanctuary Live
              </button>
            </>
          ) : (
            <>
              <button 
                type="button"
                onClick={() => setAuthModal('signin')} 
                className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white rounded-2xl text-lg font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer"
              >
                Launch Member Portal <ArrowRight size={20} />
              </button>
              <button 
                type="button"
                onClick={() => setAuthModal('signup')} 
                className="w-full sm:w-auto px-8 py-4 bg-slate-100 text-slate-800 rounded-2xl text-lg font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Register New Account
              </button>
            </>
          )}
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 text-left">
          <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
              <Users size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Congregation & Ministries</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Complete member directory, department leadership (Choir, Youth, Ushers, Media), and pastoral care tools.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-6">
              <Radio size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Live Sanctuary Streaming</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Broadcast Sunday services with live viewer count, RTMP encoder management, and real-time congregation chat.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
              <DollarSign size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Giving & Stewardship</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Member giving portal for tithes, offerings, and building funds with instant receipts and financial ledger tracking.
            </p>
          </div>
        </div>
      </div>

      {/* In-page interactive modal */}
      {authModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAuthModal(null);
          }}
        >
          <AuthCard 
            initialSignUp={authModal === 'signup'} 
            onClose={() => setAuthModal(null)} 
          />
        </div>
      )}
    </div>
  );
};

// --- Main App Root ---

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fc_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleDesktopSidebar = () => {
    setDesktopSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('fc_sidebar_collapsed', String(next));
      } catch {
        // Ignore storage write failure in restricted contexts
      }
      return next;
    });
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        console.warn('Authenticated user has no linked directory person; ending the session.');
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        return;
      }

      if (data.status === 'suspended' || data.status === 'archived') {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        return;
      }
      setProfile(data);
    } catch (e) {
      console.warn("Profile fetch issue", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data?.session || null);
        if (data?.session) {
          await fetchProfile(data.session.user.id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        setLoading(false);
      }
    };

    initializeAuth();

    const handleProfileSync = (e: any) => {
      if (e.detail) {
        setProfile(prev => {
          if (!prev) return e.detail;
          if (e.detail.id && e.detail.id !== prev.id) return prev;
          return { ...prev, ...e.detail };
        });
      }
    };
    window.addEventListener('profile-updated', handleProfileSync);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession) {
        fetchProfile(currentSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('profile-updated', handleProfileSync);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-extrabold text-2xl shadow-xl shadow-indigo-100 animate-pulse mb-4">
          FC
        </div>
        <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">
          Loading FaithConnect...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Routes>
        <Route path="/" element={<LandingPage profile={profile} session={session} />} />
        
        {/* Auth Route Page */}
        <Route path="/auth" element={<AuthRoutePage profile={profile} session={session} />} />
        
        {/* Authenticated Member & Admin Portal */}
        <Route path="/portal/*" element={
          session ? (
            <div className="min-h-screen flex bg-slate-50">
              <Sidebar 
                role={profile?.primary_role || 'member'} 
                profile={profile}
                mobileOpen={mobileMenuOpen}
                onClose={() => setMobileMenuOpen(false)}
                desktopCollapsed={desktopSidebarCollapsed}
                onToggleDesktopCollapse={handleToggleDesktopSidebar}
              />
              <div className="flex-1 min-w-0 flex flex-col">
                <Navbar 
                  profile={profile} 
                  inPortal
                  onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)}
                />
                <main className="flex-1 min-w-0 w-full px-4 py-5 sm:px-6 lg:px-8">
                  <div className="max-w-7xl mx-auto w-full min-w-0">
                    <Routes>
                      <Route index element={<OverviewPage profile={profile} />} />
                      <Route path="directory" element={<DirectoryPage profile={profile} />} />
                      <Route path="ministries" element={<MinistriesPage profile={profile} />} />
                      <Route path="giving" element={<GivingPage profile={profile} />} />
                      <Route path="prayer" element={<PrayerPage profile={profile} />} />
                      <Route path="calendar" element={<CalendarPage profile={profile} />} />
                      <Route path="resources" element={<MemberResourcesPage />} />
                      <Route path="surveys" element={<MemberEventSurveysPage profile={profile} />} />
                      <Route path="streaming" element={<StreamingPage profile={profile} />} />
                      <Route path="profile" element={<ProfilePage profile={profile} />} />
                      <Route path="leader" element={<LeaderConsolePage profile={profile} />} />
                      <Route path="finance" element={<FinanceOfficerWorkspace profile={profile} />} />
                      <Route path="admin" element={<AdminDashboard profile={profile} />} />
                      <Route path="admin/streaming/:streamId" element={<StreamDetailsPage profile={profile} />} />
                      <Route path="*" element={<Navigate to="/portal" />} />
                    </Routes>
                  </div>
                </main>
              </div>
            </div>
          ) : <Navigate to="/auth" />
        } />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
};

export default App;

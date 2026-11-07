import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Home, Users, Calendar, DollarSign, Video, Settings, 
  Menu, X, Bell, User, LogOut, LayoutDashboard,
  ShieldCheck, MapPin, Share2, ClipboardList, AlertCircle, Search, Filter, Plus, 
  CheckCircle2, Clock, Play, Radio, MessageSquare, Send, BookOpen, Heart, Sparkles, ChevronRight, ChevronLeft, ArrowRight,
  Building2, Layers, Church, Gift, FileText, Download, Check, ShieldAlert, Award, Trophy, Star,
  Printer, Upload, UserPlus, UserMinus, Trash2, Edit, Eye, Key, QrCode, Landmark, ShoppingCart, FileCode, CreditCard
} from 'lucide-react';
import { supabase, isConfigured, resetLocalDatabase } from './supabaseClient';
import type { Profile, ChurchBranch, Stream, ChatMessage, Member, Ministry, FinancialRecord, PrayerRequest, ChurchEvent, EventRegistration, GivingConfig, DepartmentRequisition, RequisitionItem } from './types';
import AdminDashboard, { StreamDetailsPage } from './AdminDashboard';
import { FinanceOfficerWorkspace } from './FinanceOfficerWorkspace';
import { getGivingConfig } from './givingConfig';
import { getRequisitions, saveRequisitions } from './requisitionService';
import { getRecurrenceBadge, getEventAccount } from './eventAccountService';
import { getChurchProfile } from './churchProfileService';

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

// --- Global Navbar ---

const Navbar = ({ 
  profile, 
  onOpenAuth,
  onToggleMobileMenu
}: { 
  profile: Profile | null;
  onOpenAuth?: (isSignUp?: boolean) => void;
  onToggleMobileMenu?: () => void;
}) => {
  const navigate = useNavigate();
  const [churchProfile, setChurchProfile] = useState(() => getChurchProfile());

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
    <nav className="fixed top-0 w-full h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 z-40 flex items-center justify-between px-4 sm:px-6 shadow-sm">
      <div className="flex items-center gap-2.5">
        {/* Mobile Hamburger Menu Toggle */}
        {profile && onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            <Menu size={22} />
          </button>
        )}

        <Link to="/" className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-extrabold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-colors overflow-hidden shrink-0">
          {churchProfile.logo_url ? (
            <img src={churchProfile.logo_url} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            'FC'
          )}
        </Link>
        <div className="flex flex-col min-w-0">
          <Link to="/" className="text-xl font-black text-slate-900 leading-none tracking-tight">
            {renderStyledMainTitle(churchProfile.main_title || 'FaithConnect')}
          </Link>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight truncate max-w-[240px]">
              {churchProfile.subtle_title || 'Grace Cathedral'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {profile ? (
          <>
            <Link 
              to="/portal" 
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
            >
              <LayoutDashboard size={14} />
              <span>Overview</span>
            </Link>

            <Link 
              to="/portal/streaming" 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors"
            >
              <Radio size={14} className="animate-pulse" />
              <span>Watch Live</span>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-900 leading-none">
                  {profile.first_name} {profile.last_name}
                </p>
                <p className="text-xs text-indigo-600 font-semibold capitalize mt-0.5">
                  {profile.primary_role?.replace('_', ' ') || 'Member'}
                </p>
              </div>

              <Link 
                to="/portal/profile" 
                title="View Profile" 
                className="w-9 h-9 bg-slate-100 rounded-full overflow-hidden border-2 border-indigo-200 hover:border-indigo-600 transition-colors flex items-center justify-center text-slate-600"
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
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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

// --- Portal Sidebar (Desktop & Mobile Slide-Over Drawer with Role Categories) ---

interface SidebarProps {
  role: string;
  mobileOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ role, mobileOpen = false, onClose }) => {
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

  const isLeaderOrStaff = ['admin', 'super_admin', 'pastor', 'district_admin', 'leader', 'worker', 'finance_officer'].includes(role);
  const isAdminOrPastor = ['admin', 'super_admin', 'pastor', 'district_admin', 'finance_officer'].includes(role);

  const churchLifeLinks = [
    { to: '/portal', icon: Home, label: 'Church Overview' },
    { to: '/portal/directory', icon: Users, label: 'Member Directory' },
    { to: '/portal/ministries', icon: Building2, label: 'Ministries & Teams' },
    { to: '/portal/calendar', icon: Calendar, label: 'Events & Calendar' },
    { to: '/portal/streaming', icon: Video, label: 'Live Sanctuary' },
    { to: '/portal/giving', icon: DollarSign, label: 'Giving & Tithes' },
    { to: '/portal/prayer', icon: Heart, label: 'Prayer Wall' },
    { to: '/portal/profile', icon: User, label: 'My Profile' }
  ];

  const leaderLinks = isLeaderOrStaff ? [
    { to: '/portal/leader', icon: Award, label: 'Ministry Leader Console' }
  ] : [];

  const adminLinks = isAdminOrPastor ? [
    { to: '/portal/admin?tab=overview', icon: LayoutDashboard, label: 'Admin Overview' },
    { to: '/portal/admin?tab=events', icon: Calendar, label: 'Events & Calendar' },
    { to: '/portal/finance', icon: Landmark, label: 'Financial Officer Console' },
    { to: '/portal/admin?tab=users', icon: Users, label: 'Congregation Roster' },
    { to: '/portal/admin?tab=roles', icon: ShieldCheck, label: 'Roles & Governance' },
    { to: '/portal/admin?tab=ministries', icon: Building2, label: 'Departments & Teams' },
    { to: '/portal/admin?tab=financials', icon: DollarSign, label: 'Tithes & Giving Ledger' },
    { to: '/portal/admin?tab=streaming', icon: Video, label: 'Broadcast Studio' },
    { to: '/portal/admin?tab=multitenant', icon: Layers, label: 'Multi-Tenant Roadmap' },
    { to: '/portal/admin?tab=settings', icon: Settings, label: 'Church Settings' }
  ] : [];

  const content = (
    <div className="flex flex-col h-full bg-white">
      {/* Sidebar Church Header */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="font-black text-slate-900 text-sm">{churchProfile.subtle_title || 'Grace Cathedral'}</h3>
        </div>
        {onClose && (
          <button 
            type="button"
            onClick={onClose} 
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-6 flex-1 overflow-y-auto">
        {/* Church Life Category (All Roles) */}
        <div className="space-y-1">
          <p className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">
            Church Ministry
          </p>
          {churchLifeLinks.map((link) => {
            const isActive = location.pathname === link.to && !location.search;
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={onClose}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'
                }`}
              >
                <link.icon size={16} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Ministry Leadership Category (Leader, Worker, Pastor, Admin) */}
        {isLeaderOrStaff && (
          <div className="space-y-1 pt-4 border-t border-slate-100">
            <p className="px-3 text-[10px] font-extrabold text-amber-600 uppercase tracking-widest mb-2 flex items-center justify-between">
              <span>Department Leadership</span>
              <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-black">Leaders</span>
            </p>
            {leaderLinks.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-100'
                      : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                  }`}
                >
                  <link.icon size={16} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pastoral & Administration Category (Admin, Super Admin, Pastor) */}
        {isAdminOrPastor && (
          <div className="space-y-1 pt-4 border-t border-slate-100">
            <p className="px-3 text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-2 flex items-center justify-between">
              <span>Pastoral & Admin</span>
              <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-black">Staff</span>
            </p>
            {adminLinks.map((link) => {
              const currentFull = location.pathname + location.search;
              const isActive = currentFull === link.to || (link.to.includes('tab=overview') && location.pathname === '/portal/admin' && !location.search);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'
                  }`}
                >
                  <link.icon size={16} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Inspirational Footer */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-[11px] text-slate-700 italic font-serif leading-relaxed">
            "For where two or three gather in my name, there am I with them."
          </p>
          <p className="text-[10px] font-bold text-indigo-600 mt-1 text-right">— Matthew 18:20</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="fixed left-0 top-16 w-64 h-[calc(100vh-64px)] bg-white border-r border-slate-200 overflow-y-auto hidden md:block z-30 shadow-xs">
        {content}
      </aside>

      {/* Mobile Slide-Over Drawer with Backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
            onClick={onClose} 
          />
          <aside className="relative w-72 max-w-[85vw] h-full bg-white shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};

// --- Auth Modal & Page with the "X" Close Button ---

interface AuthCardProps {
  initialSignUp?: boolean;
  onClose?: () => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({ initialSignUp = false, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(initialSignUp);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    setIsSignUp(initialSignUp);
  }, [initialSignUp]);

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
      if (isSignUp) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
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
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
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
      await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: 'password123'
      });
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
          {isSignUp ? 'Join Grace Cathedral Church Community' : 'Welcome back to Grace Cathedral Portal'}
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

        {isSignUp && (
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

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600 uppercase">Password</label>
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
            <span>{isSignUp ? 'Create My Account' : 'Sign In to Portal'}</span>
          )}
        </button>

        <div className="pt-2 text-center">
          <button 
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account yet? Create one"}
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
        <AuthCard initialSignUp={initialSignUp} onClose={() => navigate('/')} />
      </div>
    </div>
  );
};

// --- Portal Overview Page (Single Church Focus) ---

const OverviewPage = ({ profile }: { profile: Profile | null }) => {
  const [liveStream, setLiveStream] = useState<Stream | null>(null);

  // Automated Milestone & Celebration Scanner Service
  const [celebrations, setCelebrations] = useState<{
    id: string;
    type: 'birthday' | 'baptism' | 'marriage';
    title: string;
    description: string;
    years?: number;
    isToday?: boolean;
  }[]>([]);
  const [showCelebrationToast, setShowCelebrationToast] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const { data: sData } = await supabase.from('streams').select('*').eq('status', 'live').maybeSingle();
      if (sData) setLiveStream(sData);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!profile) return;

    const today = new Date();
    const curMonth = today.getMonth(); // 0-indexed
    const curDay = today.getDate();
    const curYear = today.getFullYear();

    const activeList: any[] = [];

    // 1. Scan Birthday
    const dob = profile.date_of_birth || '1996-10-30'; // demo member DOB falls in current month
    if (dob) {
      const d = new Date(dob);
      if (d.getMonth() === curMonth) {
        const isToday = d.getDate() === curDay;
        activeList.push({
          id: 'bday',
          type: 'birthday',
          title: isToday ? `🎉 Happy Birthday, ${profile.first_name}!` : `🎂 Happy Birthday Month, ${profile.first_name}!`,
          description: isToday
            ? `Grace Cathedral rejoices with you on your special day! "The Lord bless you and keep you; the Lord make His face shine upon you." (Numbers 6:24)`
            : `Your birthday falls in this current month (${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}). May God's favor surround you as a shield!`,
          isToday
        });
      }
    }

    // 2. Scan Water Baptism Anniversary
    const bapDate = profile.baptism_date || '2022-10-17';
    if (bapDate) {
      const bd = new Date(bapDate);
      if (bd.getMonth() === curMonth) {
        const years = Math.max(1, curYear - bd.getFullYear());
        const isToday = bd.getDate() === curDay;
        activeList.push({
          id: 'baptism',
          type: 'baptism',
          title: `🌊 ${years} Year Water Baptism Anniversary!`,
          description: isToday
            ? `Today marks ${years} years since your water baptism! "Therefore, if anyone is in Christ, the new creation has come." (2 Cor 5:17)`
            : `Celebrating your ${years}-year water baptism anniversary during this current month (${bd.toLocaleDateString([], { month: 'short', day: 'numeric' })}). Praise God for your spiritual journey!`,
          years,
          isToday
        });
      }
    }

    // 3. Scan Wedding / Marriage Anniversary
    const marrDate = profile.marriage_date || (profile.marital_status === 'Married' ? '2021-10-25' : '2021-10-25');
    if (marrDate) {
      const md = new Date(marrDate);
      if (md.getMonth() === curMonth) {
        const years = Math.max(1, curYear - md.getFullYear());
        const isToday = md.getDate() === curDay;
        activeList.push({
          id: 'marriage',
          type: 'marriage',
          title: `💍 ${years} Year Wedding Anniversary Celebration!`,
          description: isToday
            ? `Happy Wedding Anniversary today! "Therefore what God has joined together, let no one separate." (Mark 10:9)`
            : `Celebrating ${years} years of Holy Matrimony during this current month (${md.toLocaleDateString([], { month: 'short', day: 'numeric' })}). May your home be filled with God's peace and abundant love!`,
          years,
          isToday
        });
      }
    }

    setCelebrations(activeList);
  }, [profile]);

  return (
    <div className="space-y-8">
      {/* Automated Celebratory Banner & Milestone Toast Alerts */}
      {showCelebrationToast && celebrations.length > 0 && (
        <div className="space-y-4">
          {celebrations.map((item) => (
            <div 
              key={item.id} 
              className={`p-6 sm:p-7 rounded-3xl border-2 shadow-lg relative overflow-hidden transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
                item.type === 'birthday' 
                  ? 'bg-gradient-to-r from-amber-500 via-rose-500 to-pink-600 text-white border-amber-300'
                  : item.type === 'baptism'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 text-white border-cyan-300'
                  : 'bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white border-pink-300'
              }`}
            >
              <div className="absolute right-4 top-4 text-3xl opacity-20 pointer-events-none select-none">
                ✨ 🎉 🎈 ✨
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center text-3xl shrink-0 shadow-inner">
                    {item.type === 'birthday' ? '🎂' : item.type === 'baptism' ? '🌊' : '💍'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/25 text-white backdrop-blur-md">
                        {item.isToday ? '🎉 Celebration Today!' : '✨ Current Month Milestone'}
                      </span>
                      <span className="text-xs text-white/80 font-bold">• Grace Cathedral Family</span>
                    </div>
                    <h3 className="text-2xl font-black tracking-tight">{item.title}</h3>
                    <p className="text-xs sm:text-sm text-white/90 leading-relaxed mt-1 max-w-xl">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  {item.type === 'baptism' && (
                    <Link
                      to="/portal/profile"
                      className="px-4 py-2.5 bg-white text-indigo-950 font-black rounded-xl text-xs hover:bg-slate-100 transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                    >
                      <Award size={15} className="text-amber-600" />
                      View Certificate
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      alert(`✝️ Grace Cathedral Pastoral Blessing sent for your ${item.type}! May God continue to multiply grace upon your life!`);
                    }}
                    className="px-4 py-2.5 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl text-xs backdrop-blur-md transition-all cursor-pointer border border-white/30"
                  >
                    Receive Pastoral Blessing 🙏
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCelebrationToast(false)}
                    className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                    title="Dismiss Celebration Banner"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 p-8 md:p-10 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white to-transparent pointer-events-none"></div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider mb-4">
            <Sparkles size={14} /> FaithConnect Grace Cathedral
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">
            Welcome, {profile?.first_name || 'Beloved'}!
          </h1>
          <p className="text-indigo-100 text-base sm:text-lg leading-relaxed">
            Welcome to your digital church family. Engage with our worship ministries, watch live services, give your tithes & offerings, and request prayer.
          </p>
        </div>
      </div>

      {/* Live Stream Banner if Live */}
      {liveStream && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-200 flex-shrink-0 animate-pulse">
              <Radio size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-black uppercase rounded tracking-wide">
                  LIVE SANCTUARY BROADCAST
                </span>
                <span className="text-xs text-rose-600 font-bold">
                  {liveStream.view_count || 148}+ Worshipping Online
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">{liveStream.title}</h3>
              <p className="text-xs text-slate-500 line-clamp-1">{liveStream.description}</p>
            </div>
          </div>
          <Link
            to="/portal/streaming"
            className="w-full md:w-auto px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-md shadow-rose-100 transition-all flex items-center justify-center gap-2"
          >
            <Play size={16} fill="white" /> Join Sanctuary Stream
          </Link>
        </div>
      )}

      {/* Quick Action Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Link 
          to="/portal/streaming"
          className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group"
        >
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-rose-600 group-hover:text-white transition-all">
            <Video size={24} />
          </div>
          <h4 className="font-bold text-slate-900 mb-1">Live Sanctuary</h4>
          <p className="text-xs text-slate-500">Watch services live and fellowship in real-time chat.</p>
        </Link>

        <Link 
          to="/portal/giving"
          className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group"
        >
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-all">
            <DollarSign size={24} />
          </div>
          <h4 className="font-bold text-slate-900 mb-1">Giving & Tithes</h4>
          <p className="text-xs text-slate-500">Faithful giving towards tithes, offerings & projects.</p>
        </Link>

        <Link 
          to="/portal/ministries"
          className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group"
        >
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-all">
            <Building2 size={24} />
          </div>
          <h4 className="font-bold text-slate-900 mb-1">Ministries & Teams</h4>
          <p className="text-xs text-slate-500">Choir, Youth, Ushers, Intercessory, and Media.</p>
        </Link>

        <Link 
          to="/portal/prayer"
          className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group"
        >
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-amber-600 group-hover:text-white transition-all">
            <Heart size={24} />
          </div>
          <h4 className="font-bold text-slate-900 mb-1">Prayer Wall</h4>
          <p className="text-xs text-slate-500">Share prayer needs and intercede for one another.</p>
        </Link>
      </div>

      {/* Featured Weekly Highlights & Church Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Weekly Service Schedule</h3>
              <p className="text-xs text-slate-500">Grace Cathedral Gatherings</p>
            </div>
            <Link to="/portal/calendar" className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
              View Calendar &rarr;
            </Link>
          </div>

          <div className="space-y-3">
            {[
              {
                title: "Sunday Glorious Worship Service",
                time: "Sunday • 9:00 AM & 11:30 AM EST",
                location: "Main Sanctuary & Online Broadcast",
                speaker: "Rev. Sarah Johnson",
                badge: "Main Service"
              },
              {
                title: "Midweek Communion & Word Exhortation",
                time: "Wednesday • 7:00 PM EST",
                location: "Grace Hall & Live Stream",
                speaker: "Pastor David Miller",
                badge: "Bible Study"
              },
              {
                title: "Friday All-Night Intercessory Vigil",
                time: "Friday • 10:00 PM EST",
                location: "Main Sanctuary",
                speaker: "Intercessory Team",
                badge: "Prayer & Warfare"
              }
            ].map((event, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 font-black flex items-center justify-center flex-shrink-0 text-sm">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">{event.title}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                        {event.badge}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><Clock size={12} /> {event.time}</span>
                      <span className="flex items-center gap-1"><MapPin size={12} /> {event.location}</span>
                    </div>
                  </div>
                </div>
                <Link to="/portal/streaming" className="hidden sm:inline-block px-3.5 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-slate-200 rounded-xl hover:bg-indigo-50">
                  Join Stream
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Church Profile Card */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-600 uppercase tracking-wider mb-2">
              <Church size={16} /> FaithConnect Grace Cathedral
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-1">Our Church Home</h3>
            <p className="text-xs text-slate-500 mb-4">120 Grace Way, New York, NY • (555) 234-5678</p>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Pastoral Care:</span>
                <span className="font-bold text-slate-800">Rev. Sarah & Pastor David</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Your Status:</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Active Member
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="font-bold text-indigo-600 uppercase text-[10px]">
                  {profile?.primary_role?.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 mt-4 space-y-2">
            <Link 
              to="/portal/directory" 
              className="w-full py-2.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              Browse Member Directory <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Church Family Baptism Anniversaries (This Month) */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center font-black text-lg">
              🌊
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Church Family Baptism Anniversaries (This Month)</h3>
              <p className="text-xs text-slate-500">Celebrate water baptism milestones with your Grace Cathedral brothers and sisters in Christ</p>
            </div>
          </div>
          <Link to="/portal/profile" className="text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
            View My Milestones &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: "Grace Campbell", bDate: "Oct 17, 2022", years: 4, role: "Active Member", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80" },
            { name: "Min. Samuel Okonkwo", bDate: "Oct 28, 2021", years: 5, role: "Youth Leader", avatar: "https://picsum.photos/seed/samuel/100/100" },
            { name: "Elijah Wright", bDate: "Oct 10, 2020", years: 6, role: "Worship Worker", avatar: "https://picsum.photos/seed/elijah/100/100" },
            { name: "Rebecca Foster", bDate: "Oct 22, 2023", years: 3, role: "Communion Servant", avatar: "https://picsum.photos/seed/rebecca/200/200" }
          ].map((item, idx) => (
            <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-300 flex-shrink-0">
                  <img src={item.avatar} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">{item.name}</h4>
                  <p className="text-[10px] text-slate-400">{item.role}</p>
                  <span className="text-[10px] font-bold text-amber-800 mt-0.5 block">{item.bDate}</span>
                </div>
              </div>
              <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-black text-center">
                {item.years} Yrs
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Church Member Directory Page with Admin CRUD, Suspend, Soft Delete & Pic Upload ---

const DirectoryPage = ({ profile }: { profile: Profile | null }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [viewingPerson, setViewingPerson] = useState<Profile | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Profile | null>(null);

  // Add / Edit Form State
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState('member');
  const [formStatus, setFormStatus] = useState('active');
  const [formAvatar, setFormAvatar] = useState('');
  const [formIsBaptized, setFormIsBaptized] = useState(false);
  const [formBaptismDate, setFormBaptismDate] = useState('');
  const [formBaptizedBy, setFormBaptizedBy] = useState('');
  const [formDob, setFormDob] = useState('');
  const [formMaritalStatus, setFormMaritalStatus] = useState<'Single' | 'Married' | 'Widowed' | 'Divorced'>('Single');
  const [formMarriageDate, setFormMarriageDate] = useState('');
  const [formCreateCredentials, setFormCreateCredentials] = useState(false);
  const [formPassword, setFormPassword] = useState('');

  // Generated Credential Display Modal State
  const [createdCredsModal, setCreatedCredsModal] = useState<{
    name: string;
    email: string;
    pass: string;
    isBaptized: boolean;
  } | null>(null);

  const isAdminOrPastor = ['super_admin', 'admin', 'pastor', 'district_admin'].includes(profile?.primary_role || '');

  useEffect(() => {
    loadDirectory();
  }, []);

  const loadDirectory = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*');
    if (data) setProfiles(data as Profile[]);
    setLoading(false);
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
    setFormFirstName('');
    setFormLastName('');
    setFormEmail('');
    setFormPhone('');
    setFormRole('member');
    setFormStatus('active');
    setFormAvatar('');
    setFormIsBaptized(true);
    setFormBaptismDate(new Date().toISOString().split('T')[0]);
    setFormBaptizedBy('Rev. Sarah Johnson');
    setFormDob('');
    setFormMaritalStatus('Single');
    setFormMarriageDate('');
    setFormCreateCredentials(true);
    setFormPassword('FaithConnect2026!');
    setAddModalOpen(true);
  };

  const openEditModal = (p: Profile) => {
    setEditingPerson(p);
    setFormFirstName(p.first_name);
    setFormLastName(p.last_name);
    setFormEmail(p.email);
    setFormPhone(p.phone || '');
    setFormRole(p.primary_role || 'member');
    setFormStatus((p as any).status || 'active');
    setFormAvatar(p.avatar_url || '');
    setFormIsBaptized(Boolean((p as any).is_baptized));
    setFormBaptismDate((p as any).baptism_date || '2022-10-17');
    setFormBaptizedBy((p as any).baptized_by || 'Rev. Sarah Johnson');
    setFormDob((p as any).date_of_birth || '');
    setFormMaritalStatus((p as any).marital_status || 'Single');
    setFormMarriageDate((p as any).marriage_date || '');
    setFormCreateCredentials(Boolean((p as any).has_login_credentials ?? true));
    setFormPassword((p as any).temporary_password || 'FaithConnect2026!');
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
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
    (newProfile as any).temporary_password = formPassword || 'FaithConnect2026!';

    await supabase.from('profiles').insert(newProfile);
    setProfiles(prev => [newProfile, ...prev]);
    setAddModalOpen(false);

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
    if (!editingPerson) return;

    const updatedData = {
      first_name: formFirstName.trim(),
      last_name: formLastName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim(),
      primary_role: formRole as any,
      status: formStatus,
      avatar_url: formAvatar || editingPerson.avatar_url,
      is_baptized: formIsBaptized,
      baptism_date: formIsBaptized ? formBaptismDate : undefined,
      baptized_by: formIsBaptized ? formBaptizedBy : undefined,
      date_of_birth: formDob || undefined,
      marital_status: formMaritalStatus,
      marriage_date: formMaritalStatus === 'Married' ? formMarriageDate : undefined,
      has_login_credentials: formCreateCredentials,
      login_email: formEmail.trim(),
      temporary_password: formPassword || 'FaithConnect2026!'
    };

    await supabase.from('profiles').update(updatedData).eq('id', editingPerson.id);
    setProfiles(prev => prev.map(p => p.id === editingPerson.id ? { ...p, ...updatedData } : p));
    setEditingPerson(null);

    if (formCreateCredentials) {
      setCreatedCredsModal({
        name: `${formFirstName} ${formLastName}`,
        email: formEmail.trim(),
        pass: formPassword || 'FaithConnect2026!',
        isBaptized: formIsBaptized
      });
    }
  };

  const handleToggleSuspend = async (person: Profile) => {
    const isCurrentlySuspended = (person as any).status === 'suspended';
    const newStatus = isCurrentlySuspended ? 'active' : 'suspended';

    await supabase.from('profiles').update({ status: newStatus }).eq('id', person.id);
    setProfiles(prev => prev.map(p => p.id === person.id ? { ...p, status: newStatus } as any : p));
  };

  const handleSoftDelete = async (person: Profile) => {
    const isDeleted = (person as any).status === 'archived';
    const newStatus = isDeleted ? 'active' : 'archived';

    await supabase.from('profiles').update({ status: newStatus }).eq('id', person.id);
    setProfiles(prev => prev.map(p => p.id === person.id ? { ...p, status: newStatus } as any : p));
  };

  const filtered = profiles.filter(p => {
    const personStatus = (p as any).status || 'active';
    if (!showArchived && personStatus === 'archived') return false;
    if (showArchived && personStatus !== 'archived') return false;

    const matchesRole = selectedRole === 'all' || p.primary_role === selectedRole;
    const nameMatch = `${p.first_name} ${p.last_name} ${p.email} ${p.phone || ''}`.toLowerCase().includes(search.toLowerCase());
    return matchesRole && nameMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Church Member Directory</h2>
          <p className="text-slate-500 text-sm">Grace Cathedral pastoral team, department ministers, and congregants.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs font-bold px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
            {filtered.length} Congregants Listed
          </div>
          {isAdminOrPastor && (
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <UserPlus size={16} /> Add New Member
            </button>
          )}
        </div>
      </div>

      {/* Filter, Search & Archive Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-3">
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

        <select 
          className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none w-full md:w-auto cursor-pointer"
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
            {showArchived ? 'Viewing Soft-Deleted' : 'View Archived'}
          </button>
        )}
      </div>

      {/* Member Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-semibold">Loading church directory...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(person => {
            const personStatus = (person as any).status || 'active';
            const isSuspended = personStatus === 'suspended';
            const isArchived = personStatus === 'archived';
            const isBaptized = Boolean((person as any).is_baptized);
            const bDate = (person as any).baptism_date;
            const hasLogin = Boolean((person as any).has_login_credentials ?? true);

            return (
              <div 
                key={person.id}
                className={`bg-white rounded-3xl border p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden ${
                  isSuspended ? 'border-rose-300 bg-rose-50/20' : isArchived ? 'border-amber-300 bg-amber-50/20 opacity-75' : 'border-slate-200'
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
                      onClick={() => setViewingPerson(person)}
                      title="View Member Details"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <Eye size={18} />
                    </button>
                  </div>

                  {/* Baptism & Login Badges */}
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

                    {hasLogin ? (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-200 flex items-center gap-1">
                        <Key size={11} className="text-emerald-600" />
                        Login Active
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg">
                        No Credentials
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-slate-500">
                    <p className="flex items-center gap-2 truncate">
                      <span className="text-slate-400 font-semibold w-14">Email:</span>
                      <span className="font-mono text-slate-700">{person.email}</span>
                    </p>
                    <p className="flex items-center gap-2 truncate">
                      <span className="text-slate-400 font-semibold w-14">Phone:</span>
                      <span className="text-slate-700">{person.phone || 'Not listed'}</span>
                    </p>
                  </div>
                </div>

                {/* Member Action Controls */}
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-1.5">
                  <a 
                    href={`mailto:${person.email}`}
                    className="flex-1 py-2 text-center text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
                  >
                    Send Email
                  </a>

                  {isAdminOrPastor && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCreatedCredsModal({
                          name: `${person.first_name} ${person.last_name}`,
                          email: person.email,
                          pass: (person as any).temporary_password || 'FaithConnect2026!',
                          isBaptized: isBaptized
                        })}
                        title="View / Create Login Credentials"
                        className="p-2 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-xl transition-colors cursor-pointer"
                      >
                        <Key size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(person)}
                        title="Edit Member Details & Photo"
                        className="p-2 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl transition-colors cursor-pointer"
                      >
                        <Edit size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleSuspend(person)}
                        title={isSuspended ? "Unsuspend Member" : "Suspend Member Access"}
                        className={`p-2 rounded-xl transition-colors cursor-pointer ${
                          isSuspended ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600'
                        }`}
                      >
                        <UserMinus size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSoftDelete(person)}
                        title={isArchived ? "Restore Member" : "Soft Delete / Archive Member"}
                        className={`p-2 rounded-xl transition-colors cursor-pointer ${
                          isArchived ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-700'
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
              <h3 className="font-extrabold text-slate-900 text-lg">Member Profile Details</h3>
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
                <p className="text-xs text-slate-500 font-mono">{viewingPerson.email}</p>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-50 text-indigo-700">
                  {viewingPerson.primary_role?.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-700">
              <div className="flex justify-between"><span className="text-slate-400">Phone:</span> <span className="font-bold">{viewingPerson.phone || 'N/A'}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date of Birth:</span> 
                <span className="font-bold text-purple-700">
                  {(viewingPerson as any).date_of_birth ? new Date((viewingPerson as any).date_of_birth).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-slate-400">Marital Status:</span> <span className="font-bold">{(viewingPerson as any).marital_status || 'Single'}</span></div>
              {(viewingPerson as any).marital_status === 'Married' && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Marriage Anniversary:</span> 
                  <span className="font-bold text-purple-800">
                    {(viewingPerson as any).marriage_date ? new Date((viewingPerson as any).marriage_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                  </span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-slate-400">Church Branch:</span> <span className="font-bold">Grace Cathedral (Main Sanctuary)</span></div>
              <div className="flex justify-between">
                <span className="text-slate-400">Water Baptism:</span> 
                <span className="font-bold text-amber-700">
                  {(viewingPerson as any).is_baptized ? `Baptized (${(viewingPerson as any).baptism_date || 'Oct 2022'})` : 'Not Baptized'}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-slate-400">Login Account:</span> <span className="font-bold text-emerald-600">Active</span></div>
              <div className="flex justify-between"><span className="text-slate-400">System Status:</span> <span className="font-bold uppercase text-emerald-600">{(viewingPerson as any).status || 'Active'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Member Since:</span> <span className="font-bold">{new Date(viewingPerson.created_at).toLocaleDateString()}</span></div>
            </div>

            <div className="pt-2 flex justify-end">
              <button onClick={() => setViewingPerson(null)} className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 cursor-pointer">
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Created Login Credentials Modal --- */}
      {createdCredsModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-emerald-200 space-y-5">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Key className="text-emerald-600" size={20} />
                <h3 className="font-extrabold text-slate-900 text-base">Member Login Credentials</h3>
              </div>
              <button onClick={() => setCreatedCredsModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs space-y-2">
              <p className="font-bold text-emerald-900">
                Credentials Ready for {createdCredsModal.name}
              </p>
              <p className="text-emerald-700">
                Provide these details to the member so they can log in to the FaithConnect portal.
              </p>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs font-mono">
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-400 uppercase block">Login Email</span>
                <p className="text-slate-900 font-bold text-sm">{createdCredsModal.email}</p>
              </div>
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-400 uppercase block">Temporary Password</span>
                <p className="text-indigo-600 font-bold text-sm">{createdCredsModal.pass}</p>
              </div>
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-400 uppercase block">Baptism Status</span>
                <p className="text-amber-800 font-bold font-sans">
                  {createdCredsModal.isBaptized ? '✓ Baptized Member' : 'Member'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(`Email: ${createdCredsModal.email}\nPassword: ${createdCredsModal.pass}`);
                  alert('Login details copied to clipboard!');
                }}
                className="px-4 py-2.5 bg-emerald-100 text-emerald-800 font-bold rounded-xl text-xs hover:bg-emerald-200 cursor-pointer"
              >
                Copy Details
              </button>
              <button 
                type="button" 
                onClick={() => setCreatedCredsModal(null)} 
                className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Add Member Modal --- */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-start justify-center p-3 sm:p-6 pt-16 sm:pt-20 pb-12 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 max-w-xl w-full shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Add New Congregation Member</h3>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-3 text-xs">
              {/* Profile Pic Upload Input */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase block mb-1">Profile Photo Upload</label>
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                  {formAvatar ? (
                    <img src={formAvatar} alt="Preview" className="w-12 h-12 rounded-full object-cover border" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                      <Upload size={20} />
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageFileChange} className="text-xs text-slate-500 cursor-pointer" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">First Name</label>
                  <input type="text" required value={formFirstName} onChange={e => setFormFirstName(e.target.value)} placeholder="e.g. Samuel" className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">Last Name</label>
                  <input type="text" required value={formLastName} onChange={e => setFormLastName(e.target.value)} placeholder="e.g. Adebayo" className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none" />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 uppercase block mb-1">Email Address</label>
                <input type="email" required value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="member@domain.com" className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none" />
              </div>

              <div>
                <label className="font-bold text-slate-600 uppercase block mb-1">Phone Number</label>
                <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">Role Privilege</label>
                  <select value={formRole} onChange={e => setFormRole(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none font-semibold">
                    <option value="member">Member</option>
                    <option value="worker">Worker</option>
                    <option value="leader">Leader</option>
                    <option value="pastor">Pastor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">Initial Status</label>
                  <select value={formStatus} onChange={e => setFormStatus(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none font-semibold">
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              {/* Date of Birth & Marital Status Section */}
              <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-200 space-y-2">
                <span className="font-bold text-purple-900 block">🎂 Birth Date & Marital Status</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-600 block mb-0.5">Date of Birth</label>
                    <input 
                      type="date" 
                      value={formDob} 
                      onChange={e => setFormDob(e.target.value)} 
                      className="w-full p-2 bg-white border rounded-xl outline-none text-xs" 
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-0.5">Marital Status</label>
                    <select 
                      value={formMaritalStatus} 
                      onChange={e => setFormMaritalStatus(e.target.value as any)} 
                      className="w-full p-2 bg-white border rounded-xl outline-none text-xs font-semibold"
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
                    <label className="font-bold text-slate-600 block mb-0.5">Marriage Anniversary Date</label>
                    <input 
                      type="date" 
                      value={formMarriageDate} 
                      onChange={e => setFormMarriageDate(e.target.value)} 
                      className="w-full p-2 bg-white border rounded-xl outline-none text-xs" 
                    />
                  </div>
                )}
              </div>

              {/* Water Baptism Record Section */}
              <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-900">
                  <input 
                    type="checkbox" 
                    checked={formIsBaptized} 
                    onChange={e => setFormIsBaptized(e.target.checked)} 
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span>Member is Water Baptized</span>
                </label>

                {formIsBaptized && (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Baptism Date</label>
                      <input 
                        type="date" 
                        value={formBaptismDate} 
                        onChange={e => setFormBaptismDate(e.target.value)} 
                        className="w-full p-2 bg-white border rounded-xl outline-none" 
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Officiating Minister</label>
                      <input 
                        type="text" 
                        value={formBaptizedBy} 
                        onChange={e => setFormBaptizedBy(e.target.value)} 
                        placeholder="e.g. Rev. Sarah Johnson" 
                        className="w-full p-2 bg-white border rounded-xl outline-none" 
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Create Login Credentials Section */}
              <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-950">
                  <input 
                    type="checkbox" 
                    checked={formCreateCredentials} 
                    onChange={e => setFormCreateCredentials(e.target.checked)} 
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>Create Login Account for Member</span>
                </label>

                {formCreateCredentials && (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Initial Password</label>
                      <div className="flex gap-1.5">
                        <input 
                          type="text" 
                          value={formPassword} 
                          onChange={e => setFormPassword(e.target.value)} 
                          className="flex-1 p-2 bg-white border rounded-xl font-mono outline-none" 
                        />
                        <button 
                          type="button" 
                          onClick={() => setFormPassword(`Grace${Math.floor(1000 + Math.random() * 9000)}!`)} 
                          className="px-2.5 py-1 bg-indigo-100 text-indigo-700 font-bold rounded-xl text-[11px]"
                        >
                          Gen
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 cursor-pointer">Create Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Edit Member Modal --- */}
      {editingPerson && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Edit Member Details</h3>
              <button onClick={() => setEditingPerson(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              {/* Profile Pic Upload Input */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase block mb-1">Update Profile Photo</label>
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                  {formAvatar ? (
                    <img src={formAvatar} alt="Preview" className="w-12 h-12 rounded-full object-cover border" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                      <Upload size={20} />
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageFileChange} className="text-xs text-slate-500 cursor-pointer" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">First Name</label>
                  <input type="text" required value={formFirstName} onChange={e => setFormFirstName(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">Last Name</label>
                  <input type="text" required value={formLastName} onChange={e => setFormLastName(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none" />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 uppercase block mb-1">Email Address</label>
                <input type="email" required value={formEmail} onChange={e => setFormEmail(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none" />
              </div>

              <div>
                <label className="font-bold text-slate-600 uppercase block mb-1">Phone Number</label>
                <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">Role Privilege</label>
                  <select value={formRole} onChange={e => setFormRole(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none font-semibold">
                    <option value="member">Member</option>
                    <option value="worker">Worker</option>
                    <option value="leader">Leader</option>
                    <option value="pastor">Pastor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">Account Status</label>
                  <select value={formStatus} onChange={e => setFormStatus(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-xl outline-none font-semibold">
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Date of Birth & Marital Status Section */}
              <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-200 space-y-2">
                <span className="font-bold text-purple-900 block">🎂 Birth Date & Marital Status</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-600 block mb-0.5">Date of Birth</label>
                    <input 
                      type="date" 
                      value={formDob} 
                      onChange={e => setFormDob(e.target.value)} 
                      className="w-full p-2 bg-white border rounded-xl outline-none text-xs" 
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-0.5">Marital Status</label>
                    <select 
                      value={formMaritalStatus} 
                      onChange={e => setFormMaritalStatus(e.target.value as any)} 
                      className="w-full p-2 bg-white border rounded-xl outline-none text-xs font-semibold"
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
                    <label className="font-bold text-slate-600 block mb-0.5">Marriage Anniversary Date</label>
                    <input 
                      type="date" 
                      value={formMarriageDate} 
                      onChange={e => setFormMarriageDate(e.target.value)} 
                      className="w-full p-2 bg-white border rounded-xl outline-none text-xs" 
                    />
                  </div>
                )}
              </div>

              {/* Water Baptism Record Section */}
              <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-900">
                  <input 
                    type="checkbox" 
                    checked={formIsBaptized} 
                    onChange={e => setFormIsBaptized(e.target.checked)} 
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span>Member is Water Baptized</span>
                </label>

                {formIsBaptized && (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Baptism Date</label>
                      <input 
                        type="date" 
                        value={formBaptismDate} 
                        onChange={e => setFormBaptismDate(e.target.value)} 
                        className="w-full p-2 bg-white border rounded-xl outline-none" 
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Officiating Minister</label>
                      <input 
                        type="text" 
                        value={formBaptizedBy} 
                        onChange={e => setFormBaptizedBy(e.target.value)} 
                        className="w-full p-2 bg-white border rounded-xl outline-none" 
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Login Credentials Section */}
              <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-950">
                  <input 
                    type="checkbox" 
                    checked={formCreateCredentials} 
                    onChange={e => setFormCreateCredentials(e.target.checked)} 
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>Generate / Enable Portal Login</span>
                </label>

                {formCreateCredentials && (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Password</label>
                      <input 
                        type="text" 
                        value={formPassword} 
                        onChange={e => setFormPassword(e.target.value)} 
                        className="w-full p-2 bg-white border rounded-xl font-mono outline-none" 
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingPerson(null)} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 cursor-pointer">Save Member Changes</button>
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
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);
  const [interestSubmitted, setInterestSubmitted] = useState(false);
  const navigate = useNavigate();

  const isLeader = profile && ['leader', 'worker', 'super_admin', 'admin', 'pastor', 'district_admin'].includes(profile.primary_role);
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
  const categoriesInDb = Array.from(new Set(ministries.map(m => m.category)));
  const defaultCategories = ['Worship', 'Youth', 'Children', 'Men', 'Women', 'Hospitality', 'Prayer', 'Production', 'Outreach'];
  const categoriesList = Array.from(new Set([...defaultCategories, ...categoriesInDb]));

  const filteredMinistries = ministries.filter(m => {
    if (selectedCategory === 'All') return true;
    return m.category.toLowerCase() === selectedCategory.toLowerCase();
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 flex items-center gap-1">
              <Building2 size={12} /> Grace Cathedral Fellowships
            </span>
            <span className="text-xs text-slate-400 font-semibold">• Active Service Teams</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Ministries & Service Teams</h2>
          <p className="text-slate-500 text-sm mt-0.5">Discover Men's & Women's fellowships, worship teams, and opportunities to serve at Grace Cathedral.</p>
        </div>

        <div className="flex flex-row items-center gap-2.5 w-full sm:w-auto">
          {/* Category Dropdown Filter placed to the left of action buttons */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 shadow-2xs flex-1 sm:flex-initial min-w-0 sm:min-w-[240px]">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-800 outline-none cursor-pointer w-full pr-1 truncate"
            >
              <option value="All">All Categories ({ministries.length})</option>
              {categoriesList.map(cat => {
                const count = ministries.filter(m => m.category.toLowerCase() === cat.toLowerCase()).length;
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

      {/* Ministries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMinistries.map((m) => {
          const roles = m.roles_and_responsibilities || [];
          return (
            <div key={m.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    m.category === 'Men' || m.category === 'Women' 
                      ? 'bg-amber-50 text-amber-900 border-amber-200' 
                      : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                  }`}>
                    {m.category}
                  </span>
                  <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {m.member_count} Active Servants
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
  const isLeaderOrStaff = profile && ['super_admin', 'admin', 'pastor', 'district_admin', 'leader', 'worker'].includes(profile.primary_role);
  const navigate = useNavigate();

  const [activeDept, setActiveDept] = useState('Media & IT Ministry');
  const [leaderConsoleSubTab, setLeaderConsoleSubTab] = useState<'roster' | 'funding'>('funding');
  
  // Requisitions loaded from requisitionService
  const [requisitions, setRequisitions] = useState<DepartmentRequisition[]>([]);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalSuccessToast, setProposalSuccessToast] = useState<string | null>(null);

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
  const [deptRoster, setDeptRoster] = useState<any[]>([
    { id: 'r-1', name: 'David Koroma', role: 'Media Team Lead', status: 'Active', duty: 'Sanctuary Main Stream Switcher' },
    { id: 'r-2', name: 'Hannah Adams', role: 'Worship Director', status: 'Active', duty: 'Sunday 1st Service Lead' },
    { id: 'r-3', name: 'Grace Campbell', role: 'Soprano Vocalist', status: 'Active', duty: 'Sunday 2nd Service Choir' }
  ]);

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
      setDeptRoster(prev => [
        ...prev,
        { id: `r_${Date.now()}`, name: vol.name, role: 'Team Member', status: 'Active', duty: 'General Roster' }
      ]);
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

  const handleSubmitFundingProposal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqTitle.trim()) return;

    const formattedItems: RequisitionItem[] = reqItems.map((item, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      item_name: item.item_name || 'Equipment Item',
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
      total_price: (Number(item.quantity) || 1) * (Number(item.unit_price) || 0)
    }));

    const totalReqAmount = formattedItems.reduce((sum, item) => sum + item.total_price, 0);

    const newReq: DepartmentRequisition = {
      id: `req-${Date.now()}`,
      requisition_number: `REQ-2026-00${requisitions.length + 1}`,
      department_name: reqDept,
      applicant_name: reqApplicantName.trim() || `${profile?.first_name} ${profile?.last_name}`,
      applicant_role: reqApplicantRole.trim() || 'Ministry Leader',
      title: reqTitle.trim(),
      description: reqDesc.trim(),
      requested_amount: totalReqAmount > 0 ? totalReqAmount : 5000,
      currency: 'SLE',
      priority: reqPriority,
      status: 'pending_approval',
      created_at: new Date().toISOString(),
      needed_by_date: reqNeededDate || new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
      vendor_quote_url: reqVendorQuote.trim() || undefined,
      disbursement_method: reqDisbMethod,
      disbursement_account_info: reqDisbInfo.trim() || undefined,
      items: formattedItems
    };

    const updated = [newReq, ...requisitions];
    saveRequisitions(updated);
    setRequisitions(updated);
    setShowProposalModal(false);

    setProposalSuccessToast(`Funding proposal ${newReq.requisition_number} submitted! The Finance Officer has been notified to review and issue disbursement.`);
    setTimeout(() => setProposalSuccessToast(null), 5000);

    setReqTitle('');
    setReqDesc('');
    setReqVendorQuote('');
    setReqDisbInfo('');
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

        {/* Action Button & Dept Selector */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowProposalModal(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-indigo-100 flex items-center gap-2 cursor-pointer transition-all shrink-0"
          >
            <Plus size={16} /> Submit Funding Proposal
          </button>

          <select 
            value={activeDept}
            onChange={(e) => {
              setActiveDept(e.target.value);
              setReqDept(e.target.value);
            }}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="Media & IT Ministry">Media & IT Ministry</option>
            <option value="Voices of Grace Choir">Voices of Grace Choir</option>
            <option value="Kingdom Youth Ministry">Kingdom Youth Ministry</option>
            <option value="Intercessory Prayer Team">Intercessory Prayer Team</option>
            <option value="Ushers & Hospitality">Ushers & Hospitality</option>
          </select>
        </div>
      </div>

      {/* Console Sub-Tab Switcher */}
      <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => setLeaderConsoleSubTab('funding')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            leaderConsoleSubTab === 'funding'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingCart size={15} />
          <span>Internal Funding Proposals & Invoices</span>
          <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
            {requisitions.length} Total
          </span>
        </button>

        <button
          type="button"
          onClick={() => setLeaderConsoleSubTab('roster')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            leaderConsoleSubTab === 'roster'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users size={15} />
          <span>Team Roster & Volunteers</span>
          <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">
            {deptRoster.length} Active
          </span>
        </button>
      </div>

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

      {/* MODULE 1: INTERNAL FUNDING PROPOSALS VIEW */}
      {leaderConsoleSubTab === 'funding' ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                  Procurement Hub
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1">Department Equipment & Budget Proposals</h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                  Submit equipment proposals (e.g. video cameras, editing workstations, wireless mics, soundboards) directly to the Finance Officer.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowProposalModal(true)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-indigo-100 flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto"
              >
                <Plus size={16} /> Draft New Proposal
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
                            req.status === 'pending_approval' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                            req.status === 'approved' ? 'bg-indigo-100 text-indigo-800' :
                            req.status === 'disbursed' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {req.status === 'pending_approval' ? 'Pending Finance Review' : req.status === 'disbursed' ? 'Invoiced & Disbursed' : req.status}
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

                      <div className="text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div>
                          <span>Preferred Payment: <strong className="text-slate-800 uppercase">{req.disbursement_method?.replace('_', ' ')}</strong></span>
                          {req.disbursement_account_info && (
                            <span className="ml-3 font-mono text-slate-700">• Account: {req.disbursement_account_info}</span>
                          )}
                        </div>
                        {req.status === 'disbursed' && req.transaction_ref && (
                          <div className="px-3 py-1 bg-emerald-50 text-emerald-800 font-bold rounded-xl border border-emerald-200 text-xs flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-emerald-600" /> Disbursed Ref: {req.transaction_ref}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* MODULE 2: ROSTER & ANNOUNCEMENTS VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Department Roster and Duty Assignments */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">{activeDept} Roster</h3>
                  <p className="text-xs text-slate-400">{deptRoster.length} Active Team Members</p>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-700 rounded-xl">
                  Ready for Sunday
                </span>
              </div>

              <div className="space-y-2.5">
                {deptRoster.map(member => (
                  <div key={member.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-xs">
                        {member.name[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{member.name}</h4>
                        <p className="text-[10px] text-indigo-600 font-semibold">{member.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-700">{member.duty}</span>
                      <p className="text-[10px] text-emerald-600 font-semibold">{member.status}</p>
                    </div>
                  </div>
                ))}
              </div>
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
      )}

      {/* --- PROPOSAL SUBMISSION MODAL FOR MINISTRY LEADERS --- */}
      {showProposalModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                  Internal Proposal Submission
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-0.5">Submit Funding Request to Finance</h3>
              </div>
              <button onClick={() => setShowProposalModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitFundingProposal} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Department / Ministry *</label>
                  <select
                    value={reqDept}
                    onChange={e => setReqDept(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
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
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Priority Level</label>
                  <select
                    value={reqPriority}
                    onChange={e => setReqPriority(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent Priority</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Proposal Title & Equipment Purpose *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Purchase 2x Video Editing Laptops & 4K Cinema Camera System"
                  value={reqTitle}
                  onChange={e => setReqTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Justification & Context for Finance Officer</label>
                <textarea
                  rows={2}
                  placeholder="Describe why this equipment is needed for ministry operations..."
                  value={reqDesc}
                  onChange={e => setReqDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Dynamic Line Items Section */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-black text-slate-900 text-xs">Itemized Price Quotation Breakdown</span>
                  <button
                    type="button"
                    onClick={handleAddReqItemRow}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} /> Add Equipment Row
                  </button>
                </div>

                <div className="space-y-2">
                  {reqItems.map((item, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row items-center gap-2">
                      <input
                        type="text"
                        placeholder="Equipment / Item Name"
                        value={item.item_name}
                        onChange={e => handleUpdateReqItemRow(idx, 'item_name', e.target.value)}
                        className="flex-1 p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input
                          type="number"
                          min={1}
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={e => handleUpdateReqItemRow(idx, 'quantity', e.target.value)}
                          className="w-16 p-2 bg-white border border-slate-200 rounded-xl text-xs text-center font-bold"
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder="Unit Price (SLE)"
                          value={item.unit_price}
                          onChange={e => handleUpdateReqItemRow(idx, 'unit_price', e.target.value)}
                          className="w-28 p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                        />
                        <span className="text-xs font-black text-indigo-700 w-24 text-right">
                          SLE {(Number(item.quantity || 1) * Number(item.unit_price || 0)).toLocaleString()}
                        </span>
                        {reqItems.length > 1 && (
                          <button type="button" onClick={() => handleRemoveReqItemRow(idx)} className="text-rose-500 p-1">
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Preferred Payment Channel</label>
                  <select
                    value={reqDisbMethod}
                    onChange={e => setReqDisbMethod(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
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
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowProposalModal(false)} className="px-4 py-2 text-slate-500 font-bold">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 shadow-md">
                  Submit Funding Proposal to Finance
                </button>
              </div>
            </form>
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

    const existingReg = registrations.find(r => r.event_id === evt.id && (r.user_id === profile?.id || r.email === userEmail));

    if (existingReg) {
      await supabase.from('event_registrations').delete().eq('id', existingReg.id);
      if (existingReg.status === 'confirmed') {
        const newCount = Math.max(0, (evt.registered_count || 1) - 1);
        await supabase.from('events').update({ registered_count: newCount }).eq('id', evt.id);
      }
      setToastMessage(`Your RSVP for "${evt.title}" has been cancelled.`);
    } else {
      const isAtCapacity = (evt.registered_count || 0) >= (evt.max_attendees || 9999);
      const regStatus = isAtCapacity ? 'waitlist' : 'confirmed';

      const newReg = {
        event_id: evt.id,
        user_id: profile?.id,
        member_name: userName,
        email: userEmail,
        phone: profile?.phone || '',
        registered_at: new Date().toISOString(),
        status: regStatus as any
      };
      await supabase.from('event_registrations').insert(newReg);
      if (!isAtCapacity) {
        const newCount = (evt.registered_count || 0) + 1;
        await supabase.from('events').update({ registered_count: newCount }).eq('id', evt.id);
        setToastMessage(`🎉 Seat confirmed for "${evt.title}"! We look forward to worshipping with you.`);
      } else {
        setToastMessage(`⏳ Event "${evt.title}" is currently at capacity. You have been added to the Waitlist!`);
      }
    }

    fetchEvents();
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

  // Milestones State
  const [milestones, setMilestones] = useState({
    baptismDate: profile?.baptism_date || '2022-10-17',
    baptizedBy: profile?.baptized_by || 'Rev. Sarah Johnson',
    membershipDate: '2022-05-01',
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
  const [bDateInput, setBDateInput] = useState(milestones.baptismDate);
  const [mDateInput, setMDateInput] = useState(milestones.membershipDate);
  const [bByInput, setBByInput] = useState(milestones.baptizedBy);

  // Dedicated Print Function for Baptism Certificate
  const handlePrintCertificate = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = churchProfile;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Certificate of Holy Baptism - ${profile?.first_name || 'Member'} ${profile?.last_name || ''}</title>
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
              box-shadow: 0 4px 10px rgba(180, 83, 9, 0.2);
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
              box-shadow: 0 4px 10px rgba(180, 83, 9, 0.2);
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
            <!-- Top Left & Right Church Logos -->
            <div class="logo-top-left">
              ${cp.logo_url ? `<img src="${cp.logo_url}" alt="Church Logo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : '✝️'}
            </div>
            <div class="logo-top-right">
              ${cp.logo_url ? `<img src="${cp.logo_url}" alt="Church Logo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : '✝️'}
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
              <div class="cert-name">${profile?.first_name || 'Faithful'} ${profile?.last_name || 'Member'}</div>
              
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
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  // Dedicated Print Function for Member ID Card
  const handlePrintIdCard = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = churchProfile;
    const memberIdCode = `FC-MEM-${(profile?.id || '1024').slice(0, 8).toUpperCase()}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Member ID Card - ${profile?.first_name || 'Member'} ${profile?.last_name || ''}</title>
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
              box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2);
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
                ${profile?.avatar_url ? `<img src="${profile.avatar_url}" alt="Member Photo" />` : `${(profile?.first_name || 'M')[0]}${(profile?.last_name || 'C')[0]}`}
              </div>
              <div class="member-info">
                <div class="role-badge">${profile?.primary_role?.replace('_', ' ') || 'COVENANT MEMBER'}</div>
                <h4>${profile?.first_name || 'Faithful'} ${profile?.last_name || 'Member'}</h4>
                <p>${profile?.email || 'member@faithconnect.church'}</p>
                <p>Phone: ${profile?.phone || 'Verified'}</p>
              </div>
            </div>
            <div class="card-footer">
              <div>
                <div>MEMBER ID NO</div>
                <div class="id-code">${memberIdCode}</div>
              </div>
              <div style="text-align: right;">
                <div>ISSUED DATE</div>
                <div style="color: #ffffff; font-weight: bold;">${new Date().getFullYear()}</div>
              </div>
            </div>
          </div>

          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSaveSuccess(false);

    await supabase.from('profiles').update({
      first_name: firstName,
      last_name: lastName,
      phone,
      date_of_birth: dobInput || undefined,
      marital_status: maritalStatusInput,
      marriage_date: maritalStatusInput === 'Married' ? marriageDateInput : undefined,
      baptism_date: bDateInput,
      baptized_by: bByInput
    }).eq('id', profile.id);

    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSaveMilestones = (e: React.FormEvent) => {
    e.preventDefault();
    setMilestones(prev => ({
      ...prev,
      baptismDate: bDateInput,
      membershipDate: mDateInput,
      baptizedBy: bByInput
    }));
    setEditMilestonesModal(false);
  };

  // Calculate membership years
  const joinYear = new Date(milestones.membershipDate).getFullYear();
  const currentYear = new Date().getFullYear();
  const yearsInFellowship = Math.max(1, currentYear - joinYear);

  // Growth score calculation
  const overallSpiritualGrowth = 85;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">My Profile & Spiritual Journey</h2>
        <p className="text-slate-500 text-sm">Personal details, contact info, birth date, marital status, and Grace Cathedral spiritual milestones.</p>
      </div>

      {/* Main Profile Details Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-5 pb-6 border-b border-slate-100">
          <div className="w-20 h-20 rounded-2xl bg-indigo-100 border-2 border-indigo-200 overflow-hidden flex-shrink-0">
            <img 
              src={profile?.avatar_url || `https://picsum.photos/seed/${profile?.id}/200`} 
              alt="Avatar" 
              className="w-full h-full object-cover" 
            />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-900">
              {profile?.first_name} {profile?.last_name}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{profile?.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-black uppercase rounded-lg border border-indigo-100">
                {profile?.primary_role?.replace('_', ' ')}
              </span>
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-100">
                {yearsInFellowship} {yearsInFellowship === 1 ? 'Year' : 'Years'} Covenant Member
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4">
          {saveSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={16} /> Profile & milestone details updated successfully!
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">First Name</label>
              <input 
                type="text" 
                value={firstName} 
                onChange={(e) => setFirstName(e.target.value)} 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Last Name</label>
              <input 
                type="text" 
                value={lastName} 
                onChange={(e) => setLastName(e.target.value)} 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Phone Number</label>
            <input 
              type="text" 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Personal Birth Date & Marital Status Fields */}
          <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-3">
            <span className="text-xs font-extrabold text-purple-900 block flex items-center gap-1.5">
              🎂 Personal Birth Date & Marital Status
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-purple-800 uppercase block mb-1">
                  Date of Birth
                </label>
                <input 
                  type="date" 
                  value={dobInput} 
                  onChange={(e) => setDobInput(e.target.value)} 
                  className="w-full p-2.5 bg-white border border-purple-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500" 
                />
              </div>

              <div>
                <label className="text-xs font-bold text-purple-800 uppercase block mb-1">
                  Marital Status
                </label>
                <select 
                  value={maritalStatusInput} 
                  onChange={(e) => setMaritalStatusInput(e.target.value as any)} 
                  className="w-full p-2.5 bg-white border border-purple-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Divorced">Divorced</option>
                </select>
              </div>
            </div>

            {maritalStatusInput === 'Married' && (
              <div>
                <label className="text-xs font-bold text-purple-800 uppercase block mb-1">
                  Wedding / Marriage Anniversary Date
                </label>
                <input 
                  type="date" 
                  value={marriageDateInput} 
                  onChange={(e) => setMarriageDateInput(e.target.value)} 
                  className="w-full p-2.5 bg-white border border-purple-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500" 
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Assigned System Role</label>
            <input 
              type="text" 
              disabled 
              value={profile?.primary_role?.toUpperCase()} 
              className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-400">Roles can be adjusted by your Lead Pastor or Church Admin.</p>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              disabled={saving}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* --- Spiritual Growth Progression & Donut Chart Section --- */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-8 text-white shadow-xl space-y-6 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
          {/* SVG Donut Chart */}
          <div className="relative w-44 h-44 flex-shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              {/* Background circle */}
              <path
                className="text-indigo-950/60"
                strokeWidth="3.8"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              {/* Foreground circle gradient progress (85%) */}
              <path
                className="text-amber-400 transition-all duration-1000 ease-out"
                strokeDasharray={`${overallSpiritualGrowth}, 100`}
                strokeWidth="3.8"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute flex flex-col items-center text-center">
              <span className="text-3xl font-black text-amber-300 tracking-tight">{overallSpiritualGrowth}%</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-200">Spiritual Growth</span>
            </div>
          </div>

          <div className="flex-1 space-y-4 w-full">
            <div>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                Discipleship Journey
              </span>
              <h3 className="text-2xl font-black mt-2">Spiritual Progression Matrix</h3>
              <p className="text-xs text-indigo-200">
                Your Christian growth milestones mapped across core discipleship pillars at Grace Cathedral.
              </p>
            </div>

            {/* Progress Bars */}
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-indigo-100 flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-400" /> Water Baptism</span>
                  <span className="text-emerald-400">100% (Completed)</span>
                </div>
                <div className="w-full bg-indigo-950/80 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full rounded-full" style={{ width: '100%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-indigo-100 flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-400" /> Covenant Membership</span>
                  <span className="text-emerald-400">100% (Confirmed)</span>
                </div>
                <div className="w-full bg-indigo-950/80 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full rounded-full" style={{ width: '100%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-indigo-100 flex items-center gap-1.5"><BookOpen size={13} className="text-amber-400" /> Discipleship & Communion</span>
                  <span className="text-amber-300">75% (Active Learner)</span>
                </div>
                <div className="w-full bg-indigo-950/80 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-400 h-full rounded-full" style={{ width: '75%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-indigo-100 flex items-center gap-1.5"><Sparkles size={13} className="text-indigo-300" /> Ministry Servant Leadership</span>
                  <span className="text-indigo-300">60% (In Training)</span>
                </div>
                <div className="w-full bg-indigo-950/80 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-400 h-full rounded-full" style={{ width: '60%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- Spiritual Milestones & Recognitions Section --- */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Trophy size={20} className="text-amber-500" />
              <h3 className="text-xl font-extrabold text-slate-900">Spiritual Milestones & Certificates</h3>
            </div>
            <p className="text-xs text-slate-500">Track water baptism dates, membership anniversaries, and official certificates.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIdCardModal(true)}
              className="px-3.5 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-xl transition-colors cursor-pointer border border-indigo-200/60 flex items-center gap-1.5"
            >
              <CreditCard size={14} />
              Member ID Card
            </button>
            <button
              type="button"
              onClick={() => setCertificateModal(true)}
              className="px-3.5 py-2 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold rounded-xl transition-colors cursor-pointer border border-amber-200/60 flex items-center gap-1.5"
            >
              <Printer size={14} />
              Baptism Certificate
            </button>
            <button
              type="button"
              onClick={() => setEditMilestonesModal(true)}
              className="px-3.5 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Update
            </button>
          </div>
        </div>

        {/* Milestone Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 relative group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Water Baptism</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                Completed
              </span>
            </div>
            <p className="text-lg font-black text-slate-900">{new Date(milestones.baptismDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <p className="text-xs text-slate-500">Officiated by <strong className="text-slate-700">{milestones.baptizedBy}</strong></p>
            <button
              type="button"
              onClick={() => setCertificateModal(true)}
              className="w-full mt-2 py-2 bg-white border border-slate-200 text-amber-700 hover:bg-amber-50 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
            >
              <FileText size={14} /> View & Download Certificate
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Church Membership</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800">
                {yearsInFellowship} Years Active
              </span>
            </div>
            <p className="text-lg font-black text-slate-900">{new Date(milestones.membershipDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <p className="text-xs text-slate-500">{churchProfile.subtle_title || churchProfile.name} Covenant Member</p>
            <button
              type="button"
              onClick={() => setIdCardModal(true)}
              className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
            >
              <CreditCard size={14} /> View & Print Digital Member ID Card
            </button>
          </div>
        </div>

        {/* Badges / Achievements Recognition Section */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
            Special Recognitions & Service Badges
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {milestones.achievements.map(ach => (
              <div key={ach.id} className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center gap-3 shadow-2xs">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ach.badgeColor}`}>
                  <ach.icon size={20} />
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 text-xs">{ach.title}</h5>
                  <p className="text-[10px] text-slate-400 mt-0.5">Awarded {ach.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formal Baptism Certificate Modal */}
      {certificateModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-start justify-center p-3 sm:p-6 pt-20 sm:pt-24 pb-12 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-10 max-w-2xl w-full shadow-2xl border border-amber-200 my-auto space-y-6">
            <div className="flex justify-between items-center border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <Award size={22} className="text-amber-600" />
                <h3 className="font-black text-slate-900 text-lg">Official Church Baptism Certificate</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintCertificate}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} /> Print / Save as PDF
                </button>
                <button 
                  type="button"
                  onClick={() => setCertificateModal(false)} 
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Certificate Preview Modal Area */}
            <div id="printable-certificate" className="border-8 border-double border-amber-600/70 bg-gradient-to-b from-amber-50/40 via-white to-amber-50/30 p-8 sm:p-12 rounded-2xl text-center space-y-6 relative font-serif shadow-inner">
              <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-amber-600/60 pointer-events-none"></div>
              <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-amber-600/60 pointer-events-none"></div>
              <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-amber-600/60 pointer-events-none"></div>
              <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-amber-600/60 pointer-events-none"></div>

              {/* Church Seal / Branding */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full border-2 border-amber-500/80 flex items-center justify-center text-amber-800 shadow-md mb-2">
                  {churchProfile.logo_url ? (
                    <img src={churchProfile.logo_url} alt="Logo" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <Church size={32} />
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-wider uppercase font-sans">
                  {churchProfile.subtle_title || churchProfile.name}
                </h2>
                <p className="text-xs uppercase font-bold text-amber-800 tracking-widest font-sans mt-0.5">
                  Church of Faith & Christian Fellowship
                </p>
              </div>

              <div className="py-2">
                <h1 className="text-2xl sm:text-4xl font-extrabold text-amber-900 font-serif tracking-tight border-b-2 border-amber-300 inline-block pb-1 px-6">
                  Certificate of Holy Baptism
                </h1>
              </div>

              <p className="text-sm italic text-slate-600 max-w-md mx-auto leading-relaxed">
                "Therefore we are buried with Him by baptism into death: that like as Christ was raised up from the dead by the glory of the Father, even so we also should walk in newness of life."
                <span className="block font-bold text-amber-800 not-italic text-xs mt-1">— Romans 6:4</span>
              </p>

              <div className="py-4 space-y-3">
                <p className="text-xs font-sans uppercase tracking-widest text-slate-500">This certifies that</p>
                <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-serif border-b border-amber-400/80 inline-block px-8 py-1">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-xs text-slate-600 max-w-md mx-auto pt-2">
                  Having publicly professed faith in our Lord and Savior Jesus Christ, was baptized by immersion on
                </p>
                <p className="text-lg font-bold text-amber-900 font-sans">
                  {new Date(milestones.baptismDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>

              {/* Signatures */}
              <div className="pt-8 border-t border-amber-200/80 grid grid-cols-2 gap-8 text-center font-sans">
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
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mt-1">Senior Pastor, {churchProfile.subtle_title || churchProfile.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official Member ID Card Modal */}
      {idCardModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-indigo-200 space-y-6 my-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={22} className="text-indigo-600" />
                <h3 className="font-black text-slate-900 text-lg">Official Church Member ID Card</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintIdCard}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} /> Print ID Card
                </button>
                <button 
                  type="button"
                  onClick={() => setIdCardModal(false)} 
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ID CARD PREVIEW (High Fidelity Digital Badge) */}
            <div className="space-y-4">
              {/* FRONT OF ID CARD */}
              <div className="w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 rounded-2xl p-6 text-white shadow-xl border border-indigo-500/30 relative overflow-hidden space-y-4">
                {/* Decorative background watermarks */}
                <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
                <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-amber-500/10 rounded-full blur-xl pointer-events-none"></div>

                {/* Card Header */}
                <div className="flex justify-between items-start border-b border-indigo-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 font-bold overflow-hidden shrink-0">
                      {churchProfile.logo_url ? (
                        <img src={churchProfile.logo_url} alt="Church Logo" className="w-full h-full object-cover" />
                      ) : (
                        <Church size={20} />
                      )}
                    </div>
                    <div>
                      <h4 className="font-black text-sm tracking-wide text-white uppercase">{churchProfile.subtle_title || churchProfile.name}</h4>
                      <p className="text-[10px] text-indigo-300 font-semibold uppercase tracking-wider">Church Member Credential</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
                    Active Member
                  </span>
                </div>

                {/* Card Main Body */}
                <div className="flex items-center gap-4 py-2">
                  <div className="w-20 h-20 rounded-2xl bg-indigo-900/60 border-2 border-indigo-400/50 overflow-hidden shadow-inner flex items-center justify-center text-indigo-200 font-black text-2xl shrink-0">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={`${profile?.first_name} ${profile?.last_name}`} className="w-full h-full object-cover" />
                    ) : (
                      <span>{(profile?.first_name || 'M')[0]}{(profile?.last_name || 'C')[0]}</span>
                    )}
                  </div>
                  <div className="space-y-1 overflow-hidden">
                    <span className="inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      {profile?.primary_role?.replace('_', ' ') || 'COVENANT MEMBER'}
                    </span>
                    <h3 className="font-extrabold text-lg text-white truncate">{profile?.first_name || 'Faithful'} {profile?.last_name || 'Member'}</h3>
                    <p className="text-xs text-indigo-200 truncate">{profile?.email || 'member@faithconnect.church'}</p>
                    <p className="text-[11px] text-indigo-300 font-mono">Phone: {profile?.phone || 'Verified'}</p>
                  </div>
                </div>

                {/* Card Footer with QR Code & ID Code */}
                <div className="flex justify-between items-end border-t border-indigo-800/80 pt-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 block">Member ID Number</span>
                    <span className="font-mono text-xs font-black text-amber-300 tracking-wider">
                      FC-MEM-{(profile?.id || '1024').slice(0, 8).toUpperCase()}
                    </span>
                    <div className="text-[10px] text-slate-400 mt-1">Joined: {new Date(milestones.membershipDate).toLocaleDateString()}</div>
                  </div>
                  <div className="p-1.5 bg-white rounded-xl shadow-md border border-indigo-100 flex items-center justify-center">
                    <QRCodeSVG 
                      value={`https://faithconnect.church/verify-member?id=${profile?.id || 'demo'}`} 
                      size={52} 
                      level="M"
                    />
                  </div>
                </div>
              </div>

              {/* CARD REVERSE / BACK PREVIEW */}
              <div className="w-full bg-slate-100 rounded-2xl p-4 border border-slate-300 text-slate-700 text-xs space-y-3">
                <div className="w-full h-7 bg-slate-900 rounded-lg flex items-center px-3 text-[10px] font-mono text-slate-400">
                  |||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <div>
                    <strong>Sanctuary Hotline:</strong> {churchProfile.phone}
                  </div>
                  <div>
                    <strong>Official Email:</strong> {churchProfile.email}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 italic text-center border-t border-slate-200 pt-2">
                  This card certifies covenant membership at {churchProfile.name}. Present for sanctuary entry, communion, and voting in church governance.
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrintIdCard}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer size={16} /> Print Official ID Card / Badge
              </button>
              <button
                type="button"
                onClick={() => setIdCardModal(false)}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Milestones Modal */}
      {editMilestonesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-base">Update Spiritual Milestones</h3>
              <button onClick={() => setEditMilestonesModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveMilestones} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Water Baptism Date</label>
                <input
                  type="date"
                  value={bDateInput}
                  onChange={(e) => setBDateInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-semibold outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Baptism Officiating Pastor</label>
                <input
                  type="text"
                  value={bByInput}
                  onChange={(e) => setBByInput(e.target.value)}
                  placeholder="e.g. Rev. Sarah Johnson"
                  className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-semibold outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Grace Cathedral Membership Date</label>
                <input
                  type="date"
                  value={mDateInput}
                  onChange={(e) => setMDateInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-semibold outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditMilestonesModal(false)} className="px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 cursor-pointer">Save Milestones</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Demo Data */}
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => {
            if (confirm("Reset database to initial Grace Cathedral sample data?")) {
              resetLocalDatabase();
            }
          }}
          className="text-xs text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
        >
          Reset Sample Data & Reload
        </button>
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

  const fetchProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (data) {
        setProfile(data);
      } else {
        setProfile({
          id: userId,
          branch_id: 'branch-1',
          first_name: 'Faithful',
          last_name: 'Member',
          email: session?.user?.email || 'user@faithconnect.church',
          phone: '',
          primary_role: 'member',
          created_at: new Date().toISOString()
        });
      }
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession) {
        fetchProfile(currentSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
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
            <div className="min-h-screen pt-16 md:pl-64 bg-slate-50">
              <Navbar 
                profile={profile} 
                onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)} 
              />
              <Sidebar 
                role={profile?.primary_role || 'member'} 
                mobileOpen={mobileMenuOpen}
                onClose={() => setMobileMenuOpen(false)}
              />
              <main className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto">
                <Routes>
                  <Route index element={<OverviewPage profile={profile} />} />
                  <Route path="directory" element={<DirectoryPage profile={profile} />} />
                  <Route path="ministries" element={<MinistriesPage profile={profile} />} />
                  <Route path="giving" element={<GivingPage profile={profile} />} />
                  <Route path="prayer" element={<PrayerPage profile={profile} />} />
                  <Route path="calendar" element={<CalendarPage profile={profile} />} />
                  <Route path="streaming" element={<StreamingPage profile={profile} />} />
                  <Route path="profile" element={<ProfilePage profile={profile} />} />
                  <Route path="leader" element={<LeaderConsolePage profile={profile} />} />
                  <Route path="finance" element={<FinanceOfficerWorkspace profile={profile} />} />
                  <Route path="admin" element={<AdminDashboard profile={profile} />} />
                  <Route path="admin/streaming/:streamId" element={<StreamDetailsPage profile={profile} />} />
                  <Route path="*" element={<Navigate to="/portal" />} />
                </Routes>
              </main>
            </div>
          ) : <Navigate to="/auth" />
        } />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
};

export default App;

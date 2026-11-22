import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { getChurchProfile } from './churchProfileService';
import { getGivingConfig } from './givingConfig';
import { resolveMemberMinistryStatus } from './ministryMemberService';
import {
  buildPassbookCsv,
  getPassbooksForMember,
  type MemberPassbookDetail
} from './welfareContributionService';
import { MemberWelfarePassbookModal } from './MemberWelfarePassbookModal';
import type { Ministry, MinistryMember, Profile } from './types';

export interface MemberWelfarePassbookPortalPageProps {
  profile: Profile | null;
}

export const MemberWelfarePassbookPortalPage: React.FC<MemberWelfarePassbookPortalPageProps> = ({
  profile
}) => {
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [memberships, setMemberships] = useState<MinistryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeDetail, setActiveDetail] = useState<MemberPassbookDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const churchProfile = getChurchProfile();
  const givingConfig = getGivingConfig();
  const currency = givingConfig.currency_code || 'SLE';

  const loadMemberDepartments = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [minRes, memRes] = await Promise.all([
        supabase.from('ministries').select('*'),
        supabase.from('ministry_members').select('*')
      ]);
      if (minRes.error) throw minRes.error;
      if (memRes.error) throw memRes.error;
      setMinistries((minRes.data || []) as Ministry[]);
      setMemberships(((memRes.data || []) as MinistryMember[]).filter(m => m.status !== 'inactive'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load ministry passbooks.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadMemberDepartments();
  }, [loadMemberDepartments]);

  useEffect(() => {
    const handleRefresh = () => {
      setRefreshTick(prev => prev + 1);
    };
    window.addEventListener('dept_welfare_updated', handleRefresh);
    window.addEventListener('dept_welfare_campaigns_updated', handleRefresh);
    return () => {
      window.removeEventListener('dept_welfare_updated', handleRefresh);
      window.removeEventListener('dept_welfare_campaigns_updated', handleRefresh);
    };
  }, []);

  const memberDepartmentNames = useMemo(() => {
    if (!profile) return [];
    const names = new Set<string>();

    ministries.forEach(ministry => {
      const status = resolveMemberMinistryStatus({
        ministry,
        profile,
        activeMemberships: memberships
      });
      if (status) {
        names.add(ministry.name);
      }
    });

    if (profile.assigned_department?.trim()) {
      names.add(profile.assigned_department.trim());
    }
    if (profile.department_name?.trim()) {
      names.add(profile.department_name.trim());
    }

    return Array.from(names);
  }, [memberships, ministries, profile]);

  const passbooks = useMemo(() => {
    if (!profile) return [];
    const fullName = `${profile.first_name} ${profile.last_name}`.trim() || profile.email;
    return getPassbooksForMember(
      {
        id: profile.id,
        name: fullName,
        departmentNames: memberDepartmentNames
      },
      { currency }
    );
  }, [currency, memberDepartmentNames, profile, refreshTick]);

  const summary = useMemo(() => {
    const totalContributed = passbooks.reduce(
      (sum, item) =>
        sum +
        item.card.total_welfare_paid +
        item.card.total_dues_paid +
        item.card.total_support_paid,
      0
    );
    const totalDues = passbooks.reduce((sum, item) => sum + item.card.total_dues_paid, 0);
    const goodStandingCount = passbooks.filter(
      item => item.card.status === 'Good Standing'
    ).length;
    const avgReciprocity =
      passbooks.length > 0
        ? Math.round(
            passbooks.reduce((sum, item) => sum + item.reciprocity.participation_rate, 0) /
              passbooks.length
          )
        : 100;

    return {
      count: passbooks.length,
      totalContributed,
      totalDues,
      goodStandingCount,
      avgReciprocity
    };
  }, [passbooks]);

  const handleDownloadCsv = (detail: MemberPassbookDetail) => {
    const csv = buildPassbookCsv(detail);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `welfare-passbook-${detail.card.card_number.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Loading your digital welfare passbooks…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <CreditCard size={20} className="text-indigo-600 shrink-0" />
            <span>My Digital Welfare Passbooks</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            View your stamped ministry welfare statements, monthly dues compliance, and reciprocity standing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              void loadMemberDepartments();
              setRefreshTick(prev => prev + 1);
            }}
            aria-label="Refresh welfare passbooks"
            title="Refresh welfare passbooks"
            className="min-h-[40px] w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center cursor-pointer"
          >
            <RefreshCw size={15} />
          </button>
          <Link
            to="/portal/giving"
            className="min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Give Online</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500">Active Passbooks</div>
          <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
            {summary.count}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {summary.goodStandingCount} in good standing
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500">Total Contributed</div>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono tabular-nums">
            {currency} {summary.totalContributed.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Welfare, dues & support</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500">Monthly Dues Recorded</div>
          <div className="text-2xl font-black text-emerald-700 mt-1 font-mono tabular-nums">
            {currency} {summary.totalDues.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Cumulative dues ledger</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500">Drive Reciprocity</div>
          <div className="text-2xl font-black text-indigo-700 mt-1 tabular-nums">
            {summary.avgReciprocity}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Average participation rate</div>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">
          {error}
        </div>
      )}

      {passbooks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <h3 className="text-base font-extrabold text-slate-900">
            No Ministry Passbooks Active Yet
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Your Digital Welfare Passbook automatically activates once you join a church ministry or department team.
          </p>
          <Link
            to="/portal/ministries"
            className="min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-1.5"
          >
            <span>Browse Ministries & Teams</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {passbooks.map(detail => {
            const { card, entries, reciprocity, duesMatrix } = detail;
            const paidMonths = duesMatrix.filter(c => c.status === 'paid').length;

            return (
              <article
                key={card.department_name}
                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4 min-w-0"
              >
                <div className="space-y-4">
                  {/* Top Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-extrabold text-slate-900 truncate">
                        {card.department_name}
                      </h3>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                        {card.card_number} · {card.verification_code}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold shrink-0 whitespace-nowrap ${
                        card.status === 'Good Standing'
                          ? 'text-emerald-700'
                          : card.status === 'Restricted Standing'
                          ? 'text-rose-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {card.status === 'Good Standing' ? (
                        <CheckCircle2 size={14} />
                      ) : card.status === 'Restricted Standing' ? (
                        <AlertTriangle size={14} />
                      ) : (
                        <Clock size={14} />
                      )}
                      <span>{card.status}</span>
                    </span>
                  </div>

                  {/* Three Ledger Buckets */}
                  <div className="grid grid-cols-3 gap-3 py-3 border-t border-b border-slate-100">
                    <div>
                      <div className="text-xs text-slate-500">Welfare</div>
                      <div className="font-mono text-sm font-black text-slate-900 mt-0.5 tabular-nums">
                        {currency} {card.total_welfare_paid.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Monthly Dues</div>
                      <div className="font-mono text-sm font-black text-emerald-700 mt-0.5 tabular-nums">
                        {currency} {card.total_dues_paid.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Task Support</div>
                      <div className="font-mono text-sm font-black text-indigo-700 mt-0.5 tabular-nums">
                        {currency} {card.total_support_paid.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Compact 12-Month Dues Strip */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">
                        Monthly Dues ({duesMatrix[0]?.monthKey.slice(0, 4)})
                      </span>
                      <span className="text-slate-500 tabular-nums">{paidMonths} / 12 paid</span>
                    </div>
                    <div className="grid grid-cols-12 gap-1">
                      {duesMatrix.map(cell => (
                        <div
                          key={cell.monthKey}
                          title={`${cell.label}: ${cell.status} (${currency} ${cell.paidAmount})`}
                          className={`py-1 rounded text-[10px] font-bold text-center tabular-nums ${
                            cell.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : cell.status === 'partial'
                              ? 'bg-amber-100 text-amber-800'
                              : cell.status === 'pending'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {cell.label[0]}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Reciprocity Note */}
                  <div className="text-xs text-slate-600 flex items-start gap-2">
                    <ShieldCheck size={14} className="text-indigo-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-800">{reciprocity.standing_label}</strong> ·{' '}
                      {entries.length} stamped {entries.length === 1 ? 'entry' : 'entries'}
                      {reciprocity.outstanding_drives.length > 0 &&
                        ` · ${reciprocity.outstanding_drives.length} open drive(s)`}
                    </span>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadCsv(detail)}
                    className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Download size={14} /> CSV Statement
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveDetail(detail)}
                    className="ml-auto min-h-[40px] px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <ExternalLink size={14} /> Open Full Passbook
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {activeDetail && (
        <MemberWelfarePassbookModal
          detail={activeDetail}
          churchName={`FaithConnect · ${churchProfile.name}`}
          onClose={() => setActiveDetail(null)}
        />
      )}
    </div>
  );
};

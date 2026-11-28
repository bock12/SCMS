import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  X,
  XCircle
} from 'lucide-react';
import { DepartmentRequisition } from './types';
import { financeSupabase } from './financeSupabaseClient';
import { getChurchProfile } from './churchProfileService';
import { DepartmentRequisitionPaymentWorkspace } from './DepartmentRequisitionPaymentWorkspace';
import {
  getDatabaseRequisitionPaymentSummary,
  getDepartmentFinancialStanding,
  getRequisitionBlockedReason,
  summarizeDepartmentRequisitions,
  submitDepartmentRequisitionDecision,
  type DepartmentRequisitionPaymentSummary
} from './requisitionService';

export interface RequisitionMemberProfile {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
}

interface DepartmentRequisitionWorkspaceProps {
  branchId: string | null;
  actorProfileId?: string | null;
  canApproveRequisitions?: boolean;
  canManageFinances?: boolean;
  memberProfiles?: RequisitionMemberProfile[];
  requisitions: DepartmentRequisition[];
  requisitionError: string | null;
  onReloadRequisitions: () => Promise<void>;
  onOpenApprovalsTab?: () => void;
  scopeName?: string;
}

type RequisitionStatusFilter =
  | 'all'
  | 'actionable'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'paid_or_partial';

const csvCell = (value: unknown): string => {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

const formatCurrency = (currency: string, amount: number) =>
  `${currency} ${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const statusLabel = (status: string): string => {
  if (status === 'pending_approval') return 'Awaiting approval';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  if (status === 'disbursed') return 'Disbursed (legacy)';
  if (status === 'reconciled') return 'Receipts submitted';
  if (status === 'settled') return 'Settled';
  return status.replace(/_/g, ' ');
};

const statusToneClass = (status: string): string => {
  if (status === 'approved' || status === 'settled') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'rejected') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
};

const paymentStatusLabel = (status?: DepartmentRequisitionPaymentSummary['payment_status']): string => {
  if (status === 'paid') return 'Paid';
  if (status === 'partially_paid') return 'Partially paid';
  if (status === 'payment_pending') return 'Payment pending';
  return 'Unpaid';
};

export const DepartmentRequisitionWorkspace: React.FC<DepartmentRequisitionWorkspaceProps> = ({
  branchId,
  actorProfileId,
  canApproveRequisitions,
  canManageFinances = false,
  memberProfiles,
  requisitions,
  requisitionError,
  onReloadRequisitions,
  onOpenApprovalsTab,
  scopeName
}) => {
  const [fallbackProfiles, setFallbackProfiles] = useState<RequisitionMemberProfile[]>([]);
  const [paymentSummaries, setPaymentSummaries] = useState<DepartmentRequisitionPaymentSummary[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<RequisitionStatusFilter>('all');
  const [ministryFilter, setMinistryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequisition, setSelectedRequisition] = useState<DepartmentRequisition | null>(null);
  const [preselectedPaymentReqId, setPreselectedPaymentReqId] = useState<string | null>(null);

  useEffect(() => {
    if (memberProfiles && memberProfiles.length > 0) return;
    let cancelled = false;
    const loadProfiles = async () => {
      const { data } = await financeSupabase.from('profiles').select('id,first_name,last_name');
      if (!cancelled && Array.isArray(data)) {
        setFallbackProfiles(data as RequisitionMemberProfile[]);
      }
    };
    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [memberProfiles]);

  const loadPaymentSummaries = useCallback(async () => {
    if (!branchId || !canManageFinances) {
      setPaymentSummaries([]);
      setSummaryError(null);
      return;
    }
    const result = await getDatabaseRequisitionPaymentSummary(branchId);
    if (result.error) {
      setSummaryError(result.error.message);
      setPaymentSummaries([]);
    } else {
      setSummaryError(null);
      setPaymentSummaries(result.data || []);
    }
  }, [branchId, canManageFinances]);

  useEffect(() => {
    void loadPaymentSummaries();
  }, [loadPaymentSummaries, requisitions.length]);

  useEffect(() => {
    const handleDocsUpdated = () => {
      void loadPaymentSummaries();
    };
    window.addEventListener('finance_documents_updated', handleDocsUpdated);
    return () => window.removeEventListener('finance_documents_updated', handleDocsUpdated);
  }, [loadPaymentSummaries]);

  const profileNames = useMemo(() => {
    const map = new Map<string, string>();
    const source = memberProfiles && memberProfiles.length > 0 ? memberProfiles : fallbackProfiles;
    for (const person of source) {
      const fullName = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
      if (person.id && fullName) map.set(person.id, fullName);
    }
    return map;
  }, [memberProfiles, fallbackProfiles]);

  const resolveProfileName = useCallback(
    (profileId: string | null | undefined, fallbackLabel?: string | null): string => {
      if (profileId) {
        const resolved = profileNames.get(profileId);
        if (resolved) return resolved;
        if (actorProfileId && profileId === actorProfileId) return 'You';
      }
      if (fallbackLabel && fallbackLabel.trim()) return fallbackLabel.trim();
      if (profileId) return `Profile ${profileId.slice(0, 8)}`;
      return 'Unknown user';
    },
    [profileNames, actorProfileId]
  );

  const paymentSummaryById = useMemo(
    () => new Map(paymentSummaries.map(item => [item.requisition_id, item])),
    [paymentSummaries]
  );

  const summary = useMemo(
    () => summarizeDepartmentRequisitions(requisitions, paymentSummaries),
    [requisitions, paymentSummaries]
  );

  const ministryOptions = useMemo(
    () =>
      Array.from(new Set<string>(requisitions.map(item => item.department_name).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [requisitions]
  );

  const filteredRequisitions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return requisitions.filter(req => {
      if (ministryFilter !== 'all' && req.department_name !== ministryFilter) return false;
      const payment = paymentSummaryById.get(req.id);
      if (statusFilter === 'actionable') {
        if (req.status !== 'pending_approval' || !req.approval_steps?.some(step => step.actor_can_decide)) {
          return false;
        }
      } else if (statusFilter === 'paid_or_partial') {
        if (!payment || payment.payment_status === 'unpaid') return false;
      } else if (statusFilter !== 'all' && req.status !== statusFilter) {
        return false;
      }
      if (!query) return true;
      const applicant = resolveProfileName(req.applicant_profile_id, req.applicant_name).toLowerCase();
      return (
        req.requisition_number.toLowerCase().includes(query) ||
        req.title.toLowerCase().includes(query) ||
        (req.description || '').toLowerCase().includes(query) ||
        req.department_name.toLowerCase().includes(query) ||
        applicant.includes(query) ||
        (req.vendor_quote_reference || req.vendor_quote_url || '').toLowerCase().includes(query)
      );
    });
  }, [requisitions, statusFilter, ministryFilter, searchQuery, paymentSummaryById, resolveProfileName]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    setActionError(null);
    await Promise.all([onReloadRequisitions(), loadPaymentSummaries()]);
    setRefreshing(false);
  };

  const handleDecide = async (
    req: DepartmentRequisition,
    stepId: string,
    decision: 'approved' | 'rejected'
  ) => {
    const reasonText = comments[req.id] || '';
    setActionError(null);
    setNotice(null);
    setReasonErrors(current => {
      if (!current[req.id]) return current;
      const next = { ...current };
      delete next[req.id];
      return next;
    });

    setBusyStepId(stepId);
    const result = await submitDepartmentRequisitionDecision({
      requestStepId: stepId,
      decision,
      reason: reasonText
    });

    if (result.error) {
      if (result.error.code === 'VALIDATION_ERROR') {
        setReasonErrors(current => ({ ...current, [req.id]: result.error!.message }));
      } else {
        setActionError(result.error.message);
      }
    } else {
      const approvalStatus = result.data?.approval_status;
      const trimmedReason = reasonText.trim();
      setNotice(
        decision === 'rejected'
          ? `Proposal ${req.requisition_number} rejected (${trimmedReason}). No payment can be created against it.`
          : approvalStatus === 'approved'
            ? `Proposal ${req.requisition_number} fully approved. Finance can now record linked payments below.`
            : `Approval recorded for ${req.requisition_number}. Remaining approval levels are still pending.`
      );
      setComments(current => ({ ...current, [req.id]: '' }));
      await Promise.all([onReloadRequisitions(), loadPaymentSummaries()]);
      window.dispatchEvent(new Event('requisitions_updated'));
    }
    setBusyStepId(null);
  };

  const handleJumpToPayment = (requisitionId: string) => {
    setPreselectedPaymentReqId(requisitionId);
    const element = document.getElementById('requisition-payment-workspace');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const exportCsv = () => {
    if (filteredRequisitions.length === 0) return;
    const headers = [
      'Requisition Number',
      'Submitted Date',
      'Ministry / Department',
      'Applicant',
      'Title',
      'Priority',
      'Currency',
      'Requested Amount',
      'Status',
      'Payment Status',
      'Paid Amount',
      'Reserved Amount',
      'Remaining Amount',
      'Vendor Quote Reference',
      'Approval Steps'
    ];
    const rows = filteredRequisitions.map(req => {
      const currency = (req as DepartmentRequisition & { currency_code?: string }).currency_code || req.currency || 'SLE';
      const payment = paymentSummaryById.get(req.id);
      const trail = (req.approval_steps || [])
        .map(step => {
          const decisionNotes = (step.decisions || [])
            .map(d => {
              const who = resolveProfileName(d.approver_profile_id as string | undefined);
              const note = d.comments ? ` ("${d.comments}")` : '';
              return `${d.decision} by ${who}${note}`;
            })
            .join('; ');
          return `Step ${step.step_number}: ${step.status}${decisionNotes ? ` [${decisionNotes}]` : ''}`;
        })
        .join(' | ');
      return [
        req.requisition_number,
        req.created_at ? req.created_at.slice(0, 10) : '',
        req.department_name,
        resolveProfileName(req.applicant_profile_id, req.applicant_name),
        req.title,
        req.priority,
        currency,
        Number(req.requested_amount || 0).toFixed(2),
        req.status,
        payment ? payment.payment_status : 'unpaid',
        payment ? Number(payment.paid_amount || 0).toFixed(2) : '0.00',
        payment ? Number(payment.reserved_amount || 0).toFixed(2) : '0.00',
        payment ? Number(payment.remaining_amount || 0).toFixed(2) : Number(req.requested_amount || 0).toFixed(2),
        req.vendor_quote_reference || req.vendor_quote_url || '',
        trail
      ]
        .map(csvCell)
        .join(',');
    });
    const csv = [headers.map(csvCell).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scms-ministry-proposals-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters =
    statusFilter !== 'all' || ministryFilter !== 'all' || searchQuery.trim() !== '';

  const churchProfile = getChurchProfile();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-5">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900">
              <ShoppingCart size={19} className="text-slate-700" />
              Ministry funding proposals
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Review department funding proposals by approval level. Approving authorizes spend only; Finance records linked payments separately and only posted journals count as paid.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filteredRequisitions.length > 0 && (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
              >
                <Download size={14} />
                Export CSV
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleRefreshAll()}
              disabled={refreshing}
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {(requisitionError || summaryError || actionError) && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800">
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-600" />
            <span>{actionError || requisitionError || summaryError}</span>
          </div>
        )}

        {notice && (
          <div role="status" className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" />
              <span>{notice}</span>
            </div>
            {onOpenApprovalsTab && (
              <button
                type="button"
                onClick={onOpenApprovalsTab}
                className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-900 cursor-pointer"
              >
                Open Approvals <ArrowRight size={13} />
              </button>
            )}
          </div>
        )}

        {/* KPI Overview Strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
              Awaiting approval
            </div>
            <div className="mt-1 text-2xl font-black tabular-nums text-amber-900">
              {summary.pendingApproval}
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
              {summary.awaitingMyDecision} ready for your decision
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
              Approved proposals
            </div>
            <div className="mt-1 text-2xl font-black tabular-nums text-indigo-900">
              {summary.approved}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">Authorized for linked payment</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
              Paid or in payment
            </div>
            <div className="mt-1 text-2xl font-black tabular-nums text-emerald-900">
              {summary.paidOrInPayment}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">From posted &amp; reserved payments</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
              Rejected
            </div>
            <div className="mt-1 text-2xl font-black tabular-nums text-rose-900">
              {summary.rejected}
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
              Out of {summary.total} branch proposal{summary.total === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {(summary.pendingTotalsByCurrency.length > 0 || summary.unpaidApprovedTotalsByCurrency.length > 0) && (
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {summary.pendingTotalsByCurrency.length > 0 && (
                <span className="text-slate-700">
                  <span className="font-bold uppercase tracking-wide text-amber-900 mr-2">Pending exposure</span>
                  {summary.pendingTotalsByCurrency.map(item => (
                    <span key={`p-${item.currencyCode}`} className="font-bold tabular-nums text-slate-900 mr-3">
                      {formatCurrency(item.currencyCode, item.totalAmount)} ({item.count})
                    </span>
                  ))}
                </span>
              )}
              {summary.unpaidApprovedTotalsByCurrency.length > 0 && (
                <span className="text-slate-700">
                  <span className="font-bold uppercase tracking-wide text-indigo-900 mr-2">Approved unpaid balance</span>
                  {summary.unpaidApprovedTotalsByCurrency.map(item => (
                    <span key={`u-${item.currencyCode}`} className="font-bold tabular-nums text-slate-900 mr-3">
                      {formatCurrency(item.currencyCode, item.totalAmount)} ({item.count})
                    </span>
                  ))}
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-500">Excluded from expenses until paid and posted</span>
          </div>
        )}

        {/* Filter & Search Toolbar */}
        {requisitions.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `All (${summary.total})` },
                  { id: 'actionable', label: `My queue (${summary.awaitingMyDecision})` },
                  { id: 'pending_approval', label: `Pending (${summary.pendingApproval})` },
                  { id: 'approved', label: `Approved (${summary.approved})` },
                  { id: 'paid_or_partial', label: `Paid / Partial (${summary.paidOrInPayment})` },
                  { id: 'rejected', label: `Rejected (${summary.rejected})` }
                ] as Array<{ id: RequisitionStatusFilter; label: string }>
              ).map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                  className={`min-h-[36px] whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors shrink-0 cursor-pointer ${
                    statusFilter === option.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                aria-label="Filter proposals by ministry"
                value={ministryFilter}
                onChange={e => setMinistryFilter(e.target.value)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-900"
              >
                <option value="all">All ministries</option>
                {ministryOptions.map(ministry => (
                  <option key={ministry} value={ministry}>
                    {ministry}
                  </option>
                ))}
              </select>
              <div className="relative min-w-[220px]">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search ministry proposals"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search REQ, title, applicant…"
                  className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* Requisitions List */}
        {requisitions.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No ministry funding proposals have been submitted in this branch yet.
          </p>
        ) : filteredRequisitions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-2">
            <p className="text-sm font-medium text-slate-600">
              No proposals match the selected filters.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setMinistryFilter('all');
                  setSearchQuery('');
                }}
                className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequisitions.map(req => {
              const currency = (req as DepartmentRequisition & { currency_code?: string }).currency_code || req.currency || 'SLE';
              const currentApprovalStep = req.approval_steps?.find(step => step.actor_can_decide);
              const payment = paymentSummaryById.get(req.id);
              const standing = getDepartmentFinancialStanding(req.department_name, requisitions);
              const applicantName = resolveProfileName(req.applicant_profile_id, req.applicant_name);
              const validationError = reasonErrors[req.id];
              const commentInputId = `requisition-comment-${req.id}`;
              const steps = req.approval_steps || [];
              const completedSteps = steps.filter(s => s.status === 'approved').length;
              const remainingToPay = payment ? Number(payment.remaining_amount || 0) : Number(req.requested_amount || 0);

              return (
                <article
                  key={req.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 transition-colors hover:border-slate-300 space-y-4"
                >
                  {/* Card Header: unboxed metadata + title + amount */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 pb-3.5">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono font-bold text-slate-800">{req.requisition_number}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-700">{req.department_name}</span>
                        <span aria-hidden="true">·</span>
                        <span className={req.priority === 'urgent' || req.priority === 'high' ? 'font-bold text-rose-700 capitalize' : 'capitalize'}>
                          {req.priority} priority
                        </span>
                        {req.needed_by_date && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">Needed {req.needed_by_date}</span>
                          </>
                        )}
                      </div>

                      <h4 className="text-base sm:text-lg font-black text-slate-900">{req.title}</h4>
                      {req.description && (
                        <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">{req.description}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        Submitted by <span className="font-semibold text-slate-700">{applicantName}</span>
                        {req.applicant_role ? ` (${req.applicant_role})` : ''}
                        {req.created_at ? ` · ${req.created_at.slice(0, 10)}` : ''}
                        {(req.vendor_quote_reference || req.vendor_quote_url) && (
                          <> · Quote: <span className="font-mono text-slate-700">{req.vendor_quote_reference || req.vendor_quote_url}</span></>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end shrink-0">
                      <div className="text-left sm:text-right">
                        <div className="text-lg font-black tabular-nums text-slate-900">
                          {formatCurrency(currency, req.requested_amount)}
                        </div>
                        <span
                          className={`mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusToneClass(
                            req.status
                          )}`}
                        >
                          {statusLabel(req.status)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {req.status === 'approved' && canManageFinances && remainingToPay > 0 && (
                          <button
                            type="button"
                            onClick={() => handleJumpToPayment(req.id)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 cursor-pointer"
                          >
                            <CreditCard size={13} />
                            Record payment
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedRequisition(req)}
                          className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
                        >
                          <Printer size={13} />
                          View &amp; print
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Itemized Breakdown (clean hairline table, no nested card box) */}
                  {req.items && req.items.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-1.5 pr-4 text-left font-bold">Itemized line ({req.items.length})</th>
                            <th className="py-1.5 px-3 text-right font-bold">Qty</th>
                            <th className="py-1.5 px-3 text-right font-bold">Unit price</th>
                            <th className="py-1.5 pl-3 text-right font-bold">Line total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {req.items.map(item => (
                            <tr key={item.id}>
                              <td className="py-1.5 pr-4 font-medium text-slate-800">{item.item_name}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums text-slate-600">{item.quantity}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums text-slate-600">
                                {Number(item.unit_price || 0).toLocaleString()}
                              </td>
                              <td className="py-1.5 pl-3 text-right font-bold tabular-nums text-slate-900">
                                {currency} {Number(item.total_price || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Payment Progress & Standing Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        Payment: <strong className="text-slate-900">{paymentStatusLabel(payment?.payment_status)}</strong>
                      </span>
                      {payment && (
                        <span className="tabular-nums">
                          Paid <strong className="text-emerald-700">{formatCurrency(currency, payment.paid_amount)}</strong>
                          {' · '}Reserved <strong className="text-amber-800">{formatCurrency(currency, payment.reserved_amount)}</strong>
                          {' · '}Remaining <strong className="text-slate-900">{formatCurrency(currency, payment.remaining_amount)}</strong>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-medium text-slate-600">
                      Ministry standing: <strong className="text-slate-800">{standing.standing_status}</strong>
                    </div>
                  </div>

                  {/* Multi-Step Database Approval Trail */}
                  {steps.length > 0 && (
                    <div className="space-y-2 border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                        <Clock3 size={14} className="text-slate-500" />
                        <span className="tabular-nums">
                          Approval progress: {completedSteps}/{steps.length} steps approved
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {steps.map(step => {
                          const decisions = step.decisions || [];
                          return (
                            <div key={step.id} className="space-y-1">
                              <span
                                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusToneClass(
                                  step.status
                                )}`}
                              >
                                Step {step.step_number}: {step.status} ({step.approvals_received}/{step.required_approvals})
                              </span>
                              {decisions.map((decision, idx) => {
                                const who = resolveProfileName(decision.approver_profile_id as string | undefined);
                                const note = decision.comments ? String(decision.comments) : '';
                                return (
                                  <p key={`${step.id}-d-${idx}`} className="text-xs text-slate-600">
                                    <strong className="capitalize">{String(decision.decision)}</strong> by {who}
                                    {note ? ` — “${note}”` : ''}
                                  </p>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Legacy notes fallback when historical records exist without approval_steps */}
                  {steps.length === 0 && (req.pastor_approval_notes || req.finance_officer_review_notes || req.board_notes) && (
                    <div className="border-t border-slate-100 pt-3 text-xs text-slate-600 space-y-1">
                      {req.pastor_approval_notes && (
                        <p>
                          <strong>Pastoral note:</strong> {req.pastor_approval_notes}
                        </p>
                      )}
                      {req.finance_officer_review_notes && (
                        <p>
                          <strong>Treasury note:</strong> {req.finance_officer_review_notes}
                        </p>
                      )}
                      {req.board_notes && (
                        <p>
                          <strong>Board note:</strong> {req.board_notes}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Inline Decision Form OR Contextual Blocked Reason */}
                  {req.status === 'pending_approval' && currentApprovalStep ? (
                    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <label htmlFor={commentInputId} className="block text-xs font-bold text-slate-800">
                          Step {currentApprovalStep.step_number} approval note or rejection reason
                        </label>
                        <span className="text-[11px] text-slate-500">
                          Required when rejecting; optional when approving
                        </span>
                      </div>
                      <textarea
                        id={commentInputId}
                        rows={2}
                        placeholder="Enter your approval note or rejection reason…"
                        aria-invalid={Boolean(validationError)}
                        aria-describedby={validationError ? `${commentInputId}-error` : undefined}
                        className={`w-full rounded-lg border bg-white p-2.5 text-sm text-slate-900 outline-none ${
                          validationError
                            ? 'border-rose-400 focus:border-rose-500'
                            : 'border-slate-300 focus:border-slate-900'
                        }`}
                        value={comments[req.id] || ''}
                        onChange={event => {
                          const value = event.target.value;
                          setComments(current => ({ ...current, [req.id]: value }));
                          if (validationError && value.trim()) {
                            setReasonErrors(current => {
                              const next = { ...current };
                              delete next[req.id];
                              return next;
                            });
                          }
                        }}
                      />
                      {validationError && (
                        <p id={`${commentInputId}-error`} role="alert" className="text-xs font-semibold text-rose-700">
                          {validationError}
                        </p>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyStepId === currentApprovalStep.id}
                          onClick={() => void handleDecide(req, currentApprovalStep.id, 'rejected')}
                          className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50 shrink-0 cursor-pointer"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                        <button
                          type="button"
                          disabled={busyStepId === currentApprovalStep.id}
                          onClick={() => void handleDecide(req, currentApprovalStep.id, 'approved')}
                          className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 shrink-0 cursor-pointer"
                        >
                          <CheckCircle2 size={14} /> Approve Step {currentApprovalStep.step_number}
                        </button>
                      </div>
                    </div>
                  ) : req.status === 'pending_approval' ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {getRequisitionBlockedReason(req, actorProfileId, canApproveRequisitions)}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {canManageFinances && (
        <DepartmentRequisitionPaymentWorkspace
          branchId={branchId}
          requisitions={requisitions as any[]}
          preselectedRequisitionId={preselectedPaymentReqId}
          onPaymentCreated={() => {
            void loadPaymentSummaries();
            void onReloadRequisitions();
          }}
          onOpenApprovalsTab={onOpenApprovalsTab}
        />
      )}

      {/* Printable Requisition Detail Modal (iframe-safe via window.print()) */}
      {selectedRequisition && (() => {
        const currency =
          (selectedRequisition as DepartmentRequisition & { currency_code?: string }).currency_code ||
          selectedRequisition.currency ||
          'SLE';
        const applicant = resolveProfileName(
          selectedRequisition.applicant_profile_id,
          selectedRequisition.applicant_name
        );
        const payment = paymentSummaryById.get(selectedRequisition.id);
        return (
          <div
            className="finance-detail-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Ministry proposal detail"
          >
            <div className="finance-detail-panel">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 print:hidden">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Ministry funding proposal
                  </p>
                  <h3 className="text-lg font-black font-mono text-slate-900">
                    {selectedRequisition.requisition_number}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex min-h-[38px] items-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <Printer size={14} /> Print
                  </button>
                  <button
                    type="button"
                    aria-label="Close proposal details"
                    onClick={() => setSelectedRequisition(null)}
                    className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="finance-print-sheet pt-4 space-y-5">
                <div className="border-b-2 border-slate-900 pb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    {churchProfile.name} {scopeName ? `· ${scopeName}` : ''}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-slate-900">
                    DEPARTMENT FUNDING REQUISITION
                  </h2>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-600">
                    {selectedRequisition.requisition_number}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <p className="text-xs uppercase text-slate-500">Department / Ministry</p>
                    <p className="mt-1 font-bold text-slate-900">{selectedRequisition.department_name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Applicant</p>
                    <p className="mt-1 font-bold text-slate-900">
                      {applicant} {selectedRequisition.applicant_role ? `(${selectedRequisition.applicant_role})` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Requested amount</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                      {formatCurrency(currency, selectedRequisition.requested_amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Status &amp; priority</p>
                    <p className="mt-1 font-bold capitalize text-slate-900">
                      {statusLabel(selectedRequisition.status)} · {selectedRequisition.priority} priority
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Payment status</p>
                    <p className="mt-1 font-bold text-slate-900 tabular-nums">
                      {paymentStatusLabel(payment?.payment_status)}
                      {payment ? ` (Paid ${formatCurrency(currency, payment.paid_amount)})` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Vendor quote reference</p>
                    <p className="mt-1 font-bold text-slate-900">
                      {selectedRequisition.vendor_quote_reference || selectedRequisition.vendor_quote_url || '—'}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs uppercase text-slate-500">Title &amp; purpose</p>
                  <p className="mt-1 font-bold text-slate-900">{selectedRequisition.title}</p>
                  {selectedRequisition.description && (
                    <p className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedRequisition.description}
                    </p>
                  )}
                </div>

                {selectedRequisition.items && selectedRequisition.items.length > 0 && (
                  <table className="min-w-full border border-slate-200 text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="border-b border-slate-200 p-2.5 text-left font-bold">Item description</th>
                        <th className="border-b border-slate-200 p-2.5 text-right font-bold">Qty</th>
                        <th className="border-b border-slate-200 p-2.5 text-right font-bold">Unit price</th>
                        <th className="border-b border-slate-200 p-2.5 text-right font-bold">Line total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedRequisition.items.map(item => (
                        <tr key={item.id}>
                          <td className="p-2.5 font-medium text-slate-900">{item.item_name}</td>
                          <td className="p-2.5 text-right tabular-nums text-slate-700">{item.quantity}</td>
                          <td className="p-2.5 text-right tabular-nums text-slate-700">
                            {Number(item.unit_price || 0).toLocaleString()}
                          </td>
                          <td className="p-2.5 text-right font-bold tabular-nums text-slate-900">
                            {currency} {Number(item.total_price || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {selectedRequisition.approval_steps && selectedRequisition.approval_steps.length > 0 && (
                  <div className="border-t border-slate-200 pt-4">
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-600">
                      Approval history
                    </h4>
                    <ol className="mt-2 space-y-1.5 text-xs text-slate-700">
                      {selectedRequisition.approval_steps.map(step => (
                        <li key={step.id}>
                          Step {step.step_number}: <strong className="capitalize">{step.status}</strong>
                          {(step.decisions || []).map((d, idx) => (
                            <span key={idx}>
                              {' '}— {String(d.decision)} by {resolveProfileName(d.approver_profile_id as string | undefined)}
                              {d.comments ? ` (“${String(d.comments)}”)` : ''}
                            </span>
                          ))}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <p className="text-center text-[10px] text-slate-400">
                  Requisition authorization is not a payment voucher. Payments are recorded and posted separately by Finance.
                </p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

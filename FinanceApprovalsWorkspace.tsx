import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle
} from 'lucide-react';
import { type FinanceOwnershipScope } from './financeConfigurationService';
import {
  filterPendingFinanceDocuments,
  getFinanceWorkflowDocuments,
  getScopedFinanceWorkflowDocuments,
  submitFinanceApprovalDecision,
  summarizePendingFinanceDocuments,
  type FinanceWorkflowDocument,
  type PendingApprovalFilter
} from './financeDocumentWorkflowService';

interface Props {
  branchId: string | null;
  scope?: FinanceOwnershipScope;
  canApproveFinances?: boolean;
  onPendingCountChange?: (count: number) => void;
}

const formatDocumentReference = (document: FinanceWorkflowDocument) =>
  `${document.document_type === 'receipt' ? 'REC' : 'PAY'}-${String(document.document_number).padStart(6, '0')}`;

const formatAmount = (amount: number, currencyCode: string) =>
  `${currencyCode} ${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const getBlockedReason = (
  document: FinanceWorkflowDocument,
  actorId: string | null,
  canApproveFinances?: boolean
): string => {
  if (actorId && document.profile_id === actorId) {
    return 'Submitted by your profile. Separation of duties prevents approving or rejecting your own transaction.';
  }
  if (actorId && document.approval_steps.some(step => step.approver_profile_id === actorId)) {
    return 'You have already recorded a decision on an earlier approval step for this transaction.';
  }
  if (!canApproveFinances) {
    return 'Read-only view. Authorizing this step requires the approve_finances permission in this scope.';
  }
  const hasMultipleSteps = document.approval_steps.length > 1;
  if (hasMultipleSteps) {
    return 'Waiting for an earlier approval step or a different eligible approver.';
  }
  return 'Requires an eligible approver with approve_finances permission in this scope.';
};

export const FinanceApprovalsWorkspace: React.FC<Props> = ({
  branchId,
  scope,
  canApproveFinances = false,
  onPendingCountChange
}) => {
  const [documents, setDocuments] = useState<FinanceWorkflowDocument[]>([]);
  const [actorId, setActorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<PendingApprovalFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState<Record<string, string>>({});
  const [selectedDocument, setSelectedDocument] = useState<FinanceWorkflowDocument | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = scope
      ? await getScopedFinanceWorkflowDocuments(scope)
      : await getFinanceWorkflowDocuments(branchId);

    if (result.error) {
      setError(result.error.message);
      setDocuments([]);
      setActorId(null);
      onPendingCountChange?.(0);
    } else {
      const nextDocuments = result.data?.documents || [];
      setDocuments(nextDocuments);
      setActorId(result.data?.actor_profile_id || null);
      onPendingCountChange?.(summarizePendingFinanceDocuments(nextDocuments).totalPending);
    }
    setLoading(false);
  }, [branchId, scope?.type, scope?.id, onPendingCountChange]);

  useEffect(() => {
    void reload();
    const handleDocumentsUpdated = () => {
      void reload();
    };
    window.addEventListener('finance_documents_updated', handleDocumentsUpdated);
    return () => window.removeEventListener('finance_documents_updated', handleDocumentsUpdated);
  }, [reload]);

  const summary = useMemo(() => summarizePendingFinanceDocuments(documents), [documents]);
  const pendingDocuments = useMemo(
    () => filterPendingFinanceDocuments(documents, filter, searchQuery),
    [documents, filter, searchQuery]
  );

  const handleDecision = async (document: FinanceWorkflowDocument, decision: 'approved' | 'rejected') => {
    if (!document.actor_approval_step_id) return;

    const reasonText = reasons[document.id] || '';
    setError(null);
    setNotice(null);
    setReasonErrors(current => {
      if (!current[document.id]) return current;
      const next = { ...current };
      delete next[document.id];
      return next;
    });

    setBusyStepId(document.actor_approval_step_id);
    const result = await submitFinanceApprovalDecision({
      requestStepId: document.actor_approval_step_id,
      decision,
      reason: reasonText
    });

    if (result.error) {
      if (result.error.code === 'VALIDATION_ERROR') {
        setReasonErrors(current => ({ ...current, [document.id]: result.error!.message }));
      } else {
        setError(result.error.message);
      }
      setBusyStepId(null);
      return;
    }

    const reference = formatDocumentReference(document);
    const trimmedReason = reasonText.trim();
    if (decision === 'rejected') {
      setNotice(`${reference} rejected (${trimmedReason}). Its draft journal remains unlinked and cannot be posted.`);
    } else if (result.data?.approval_status === 'approved') {
      setNotice(
        trimmedReason
          ? `${reference} approved (${trimmedReason}). Its balanced draft journal is now linked and ready to post.`
          : `${reference} approved. Its balanced draft journal is now linked and ready to post in the Journal Ledger.`
      );
    } else {
      setNotice(
        trimmedReason
          ? `${reference} approval step recorded (${trimmedReason}). Remaining approval levels must still sign off.`
          : `${reference} approval step recorded. Remaining approval levels must still sign off.`
      );
    }

    setReasons(current => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    await reload();
    window.dispatchEvent(new Event('finance_documents_updated'));
    setBusyStepId(null);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <ShieldCheck size={19} className="text-slate-700" />
            Pending Transaction Approvals
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review canonical receipts and payments awaiting authorization before their draft journals can be posted.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-xs font-semibold text-slate-500">Pending queue</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-slate-900">{summary.totalPending}</div>
            <p className="mt-0.5 text-xs tabular-nums text-slate-500">
              {summary.pendingReceipts} receipts · {summary.pendingPayments} payments
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-xs font-semibold text-slate-500">Awaiting your decision</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-indigo-700">{summary.awaitingMyDecision}</div>
            <p className="mt-0.5 text-xs text-slate-500">Eligible steps assigned to your profile</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-xs font-semibold text-slate-500">Pending transaction value</div>
            {summary.totalsByCurrency.length === 0 ? (
              <div className="mt-1 text-2xl font-black tabular-nums text-slate-400">—</div>
            ) : (
              <div className="mt-1 space-y-0.5">
                {summary.totalsByCurrency.map(item => (
                  <div key={item.currencyCode} className="text-lg font-black tabular-nums text-slate-900">
                    {formatAmount(item.totalAmount, item.currencyCode)}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-0.5 text-xs text-slate-500">Excluded from posted ledger balances</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter pending approvals">
          {(
            [
              { id: 'all', label: `All pending (${summary.totalPending})` },
              { id: 'receipt', label: `Receipts (${summary.pendingReceipts})` },
              { id: 'payment', label: `Payments (${summary.pendingPayments})` },
              { id: 'actionable', label: `Awaiting my decision (${summary.awaitingMyDecision})` }
            ] as const
          ).map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === option.id
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Search pending receipts and payments"
            placeholder="Search reference, party or memo…"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading pending receipts and payments…</p>
      ) : pendingDocuments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {summary.totalPending === 0
              ? 'No pending receipts or payments in this scope.'
              : 'No pending transactions match the active filter.'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.totalPending === 0
              ? 'Submitted transactions requiring approval will appear here until approved or rejected.'
              : 'Try switching filters or clearing your search query.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingDocuments.map(document => {
            const isReceipt = document.document_type === 'receipt';
            const reference = formatDocumentReference(document);
            const canDecide = Boolean(document.actor_approval_step_id && document.status === 'pending_approval');
            const isBusy = Boolean(document.actor_approval_step_id && busyStepId === document.actor_approval_step_id);
            const validationError = reasonErrors[document.id];
            const commentInputId = `pending-approval-reason-${document.id}`;

            return (
              <article key={document.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-mono font-bold text-slate-900">{reference}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-bold ${isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {isReceipt ? 'Receipt' : 'Payment'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{document.transaction_date}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{document.payment_method?.replace(/_/g, ' ') || '—'}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      <span className="font-normal text-slate-500">{isReceipt ? 'Received from ' : 'Paid to '}</span>
                      {document.payee_or_payer_name}
                    </h3>
                    {document.description && <p className="text-sm text-slate-600">{document.description}</p>}
                    {document.external_reference && (
                      <p className="text-xs text-slate-500">External reference: {document.external_reference}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className={`text-lg font-black tabular-nums ${isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatAmount(document.amount, document.currency_code)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDocument(document)}
                      className="shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      View details
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Clock3 size={14} className="text-amber-600" />
                    <span className="tabular-nums">
                      Step progress: {document.approval_steps_completed}/{document.approval_steps_total} approved
                    </span>
                  </span>
                  <span className="text-slate-400">Draft journal unlinked until final approval</span>
                </div>

                {document.approval_steps.length > 0 && (
                  <ol className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5">
                    {document.approval_steps.map(step => (
                      <li key={step.id} className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Step {step.step_order}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="capitalize">{step.status.replace(/_/g, ' ')}</span>
                        {step.decision ? ` (${step.decision})` : ''}
                        {step.comments ? ` — "${step.comments}"` : ''}
                      </li>
                    ))}
                  </ol>
                )}

                {canDecide ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <label htmlFor={commentInputId} className="text-xs font-bold text-slate-800">
                        Approval or rejection reason
                      </label>
                      <span className="text-[11px] text-slate-500">Required when rejecting; optional when approving</span>
                    </div>
                    <textarea
                      id={commentInputId}
                      rows={2}
                      placeholder="Enter your approval note or rejection reason…"
                      value={reasons[document.id] || ''}
                      aria-invalid={Boolean(validationError)}
                      aria-describedby={validationError ? `${commentInputId}-error` : undefined}
                      onChange={event => {
                        const value = event.target.value;
                        setReasons(current => ({ ...current, [document.id]: value }));
                        if (validationError && value.trim()) {
                          setReasonErrors(current => {
                            const next = { ...current };
                            delete next[document.id];
                            return next;
                          });
                        }
                      }}
                      className={`w-full rounded-lg border bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none ${
                        validationError ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-slate-500'
                      }`}
                    />
                    {validationError && (
                      <p id={`${commentInputId}-error`} role="alert" className="text-xs font-semibold text-rose-700">
                        {validationError}
                      </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDecision(document, 'rejected')}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        Reject with reason
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDecision(document, 'approved')}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        Approve
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {getBlockedReason(document, actorId, canApproveFinances)}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedDocument && (() => {
        const selectedIsReceipt = selectedDocument.document_type === 'receipt';
        const selectedReference = formatDocumentReference(selectedDocument);
        return (
          <div className="finance-detail-overlay" role="dialog" aria-modal="true" aria-label="Financial document detail">
            <div className="finance-detail-panel">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 print:hidden">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Financial document detail</p>
                  <h3 className="text-lg font-black text-slate-900">{selectedReference}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                  >
                    <Printer size={14} /> Print
                  </button>
                  <button
                    type="button"
                    aria-label="Close document details"
                    onClick={() => setSelectedDocument(null)}
                    className="rounded-lg border border-slate-300 p-2 text-slate-600"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="finance-print-sheet">
                <div className="mb-6 border-b-2 border-slate-900 pb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Church financial record</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-900">
                    {selectedIsReceipt ? 'OFFICIAL RECEIPT' : 'PAYMENT VOUCHER'}
                  </h2>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-600">{selectedReference}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase text-slate-500">{selectedIsReceipt ? 'Received from' : 'Paid to'}</p>
                    <p className="mt-1 font-bold text-slate-900">{selectedDocument.payee_or_payer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Transaction date</p>
                    <p className="mt-1 font-bold tabular-nums text-slate-900">{selectedDocument.transaction_date}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Amount</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                      {formatAmount(selectedDocument.amount, selectedDocument.currency_code)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Payment method</p>
                    <p className="mt-1 font-bold capitalize text-slate-900">
                      {selectedDocument.payment_method?.replace(/_/g, ' ') || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Status</p>
                    <p className="mt-1 font-bold capitalize text-slate-900">{selectedDocument.status.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">External reference</p>
                    <p className="mt-1 font-bold text-slate-900">{selectedDocument.external_reference || '—'}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-lg border border-slate-200 p-4">
                  <p className="text-xs uppercase text-slate-500">Description / purpose</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{selectedDocument.description || '—'}</p>
                </div>
                <div className="mt-5 grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
                  <p>Document ID: {selectedDocument.id}</p>
                  <p>Journal entry: {selectedDocument.journal_entry_id || 'Not yet linked'}</p>
                  <p className="tabular-nums">
                    Approval progress: {selectedDocument.approval_steps_completed}/{selectedDocument.approval_steps_total}
                  </p>
                  <p>Approval request: {selectedDocument.approval_request_id || '—'}</p>
                </div>
                {selectedDocument.approval_steps.length > 0 && (
                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-600">Approval history</h4>
                    <ol className="mt-2 space-y-2">
                      {selectedDocument.approval_steps.map(step => (
                        <li key={step.id} className="text-xs text-slate-700">
                          Step {step.step_order}: <strong className="capitalize">{step.status}</strong>
                          {step.decision ? ` — ${step.decision}` : ''}
                          {step.comments ? ` — ${step.comments}` : ''}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <p className="text-xs text-slate-400">
        Signed in profile: {actorId || 'Not available'}. Approval eligibility and separation of duties are enforced by the database service.
      </p>
    </section>
  );
};

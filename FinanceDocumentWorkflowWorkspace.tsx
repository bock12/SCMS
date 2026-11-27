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
import { type FinanceOwnershipScope, type FinanceScopeOption } from './financeConfigurationService';
import {
  decideFinanceWorkflowApproval,
  getFinanceWorkflowDocuments,
  getScopedFinanceWorkflowDocuments,
  type FinanceWorkflowDocument
} from './financeDocumentWorkflowService';

interface Props {
  branchId: string | null;
  scope?: FinanceOwnershipScope;
  scopeOptions?: FinanceScopeOption[];
  onPendingCountChange?: (count: number) => void;
}

type DocumentFilter = 'all' | 'actionable' | 'pending_approval' | 'approved' | 'posted' | 'rejected';
type DocumentTypeFilter = 'all' | 'receipt' | 'payment';

const statusBadgeClass = (status: string) => {
  if (status === 'approved' || status === 'posted') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (status === 'rejected') return 'bg-rose-50 text-rose-800 border-rose-200';
  return 'bg-amber-50 text-amber-800 border-amber-200';
};

const formatAmount = (currency: string, value: number) =>
  `${currency} ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

export const FinanceDocumentWorkflowWorkspace: React.FC<Props> = ({
  branchId,
  scope,
  scopeOptions = [],
  onPendingCountChange
}) => {
  const [documents, setDocuments] = useState<FinanceWorkflowDocument[]>([]);
  const [actorId, setActorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [selectedDocument, setSelectedDocument] = useState<FinanceWorkflowDocument | null>(null);
  const [statusFilter, setStatusFilter] = useState<DocumentFilter>('all');
  const [typeFilter, setTypeFilter] = useState<DocumentTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const scopeLabel = useCallback(
    (doc: FinanceWorkflowDocument) => {
      if (doc.branch_id) {
        return (
          scopeOptions.find(opt => opt.scope_type === 'branch' && opt.scope_id === doc.branch_id)?.scope_name ||
          `Branch ${doc.branch_id.slice(0, 8)}`
        );
      }
      if (doc.district_id) {
        return (
          scopeOptions.find(opt => opt.scope_type === 'district' && opt.scope_id === doc.district_id)?.scope_name ||
          `District ${doc.district_id.slice(0, 8)}`
        );
      }
      return 'Church-wide';
    },
    [scopeOptions]
  );

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
      onPendingCountChange?.(nextDocuments.filter(doc => doc.status === 'pending_approval').length);
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

  const decide = async (document: FinanceWorkflowDocument, decision: 'approved' | 'rejected') => {
    if (!document.actor_approval_step_id) return;
    setBusyStepId(document.actor_approval_step_id);
    setError(null);
    setNotice(null);
    const result = await decideFinanceWorkflowApproval({
      requestStepId: document.actor_approval_step_id,
      decision,
      comments: comments[document.id] || null
    });
    if (result.error) {
      setError(result.error.message);
    } else {
      const approvalStatus = result.data?.approval_status;
      setNotice(
        decision === 'rejected'
          ? 'Document rejected. Its draft journal remains unlinked and cannot be posted.'
          : approvalStatus === 'approved'
            ? 'Document approved. Its balanced draft journal is now linked and ready to post in the Journal Register.'
            : 'Approval decision recorded. The document remains pending until all remaining approval levels are completed.'
      );
      setComments(current => ({ ...current, [document.id]: '' }));
      await reload();
      window.dispatchEvent(new Event('finance_documents_updated'));
    }
    setBusyStepId(null);
  };

  const pendingCount = useMemo(
    () => documents.filter(document => document.status === 'pending_approval').length,
    [documents]
  );
  const actionableCount = useMemo(
    () => documents.filter(document => Boolean(document.actor_approval_step_id && document.status === 'pending_approval')).length,
    [documents]
  );
  const readyToPostCount = useMemo(
    () => documents.filter(document => document.status === 'approved').length,
    [documents]
  );

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return documents.filter(document => {
      if (typeFilter !== 'all' && document.document_type !== typeFilter) return false;
      if (statusFilter === 'actionable') {
        if (!document.actor_approval_step_id || document.status !== 'pending_approval') return false;
      } else if (statusFilter !== 'all' && document.status !== statusFilter) {
        return false;
      }
      if (!query) return true;
      const ref = `${document.document_type === 'receipt' ? 'rec' : 'pay'}-${String(document.document_number).padStart(6, '0')}`;
      return (
        ref.includes(query) ||
        document.id.toLowerCase().includes(query) ||
        document.payee_or_payer_name.toLowerCase().includes(query) ||
        (document.description || '').toLowerCase().includes(query) ||
        (document.external_reference || '').toLowerCase().includes(query) ||
        (document.payment_method || '').toLowerCase().includes(query)
      );
    });
  }, [documents, statusFilter, typeFilter, searchQuery]);

  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || searchQuery.trim() !== '';

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900">
            <ShieldCheck size={19} className="text-slate-700" />
            Financial documents &amp; approvals
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Canonical receipts and payments with multi-level approval tracking. Draft journals do not affect balances until posted.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800">
          <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" />
          <span>{notice}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Documents</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-slate-900">{documents.length}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Awaiting approval</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-amber-900">{pendingCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Awaiting my decision</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-indigo-900">{actionableCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Ready to post</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-emerald-900">{readyToPostCount}</div>
          </div>
        </div>
      )}

      {!loading && documents.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All (${documents.length})` },
                { id: 'actionable', label: `My queue (${actionableCount})` },
                { id: 'pending_approval', label: `Pending (${pendingCount})` },
                { id: 'approved', label: `Approved (${readyToPostCount})` },
                { id: 'posted', label: 'Posted' },
                { id: 'rejected', label: 'Rejected' }
              ] as Array<{ id: DocumentFilter; label: string }>
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
              aria-label="Filter by document type"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as DocumentTypeFilter)}
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-900"
            >
              <option value="all">All types</option>
              <option value="receipt">Receipts only</option>
              <option value="payment">Payments only</option>
            </select>
            <div className="relative min-w-[210px]">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Search financial documents"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search REC/PAY, name, reference…"
                className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-slate-900"
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading canonical financial documents…</p>
      ) : documents.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
          No financial documents are available in this scope yet.
        </p>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center space-y-2">
          <p className="text-sm font-medium text-slate-600">No financial documents match the selected filters.</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
                setSearchQuery('');
              }}
              className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocuments.map(document => {
            const isReceipt = document.document_type === 'receipt';
            const docReference = `${isReceipt ? 'REC' : 'PAY'}-${String(document.document_number).padStart(6, '0')}`;
            const canDecide = Boolean(document.actor_approval_step_id && document.status === 'pending_approval');
            const progressRatio =
              document.approval_steps_total > 0
                ? Math.min(100, Math.round((document.approval_steps_completed / document.approval_steps_total) * 100))
                : 100;

            return (
              <article key={document.id} className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                          isReceipt
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-rose-200 bg-rose-50 text-rose-800'
                        }`}
                      >
                        {document.document_type}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClass(
                          document.status
                        )}`}
                      >
                        {document.status.replace('_', ' ')}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-700">{docReference}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-medium text-slate-600">{scopeLabel(document)}</span>
                    </div>

                    <h4 className="pt-1 text-base font-bold text-slate-900">{document.payee_or_payer_name}</h4>
                    <p className="text-xs text-slate-500">
                      {document.transaction_date} · <span className="capitalize">{document.payment_method?.replace('_', ' ') || '—'}</span>
                      {document.external_reference ? ` · Ref: ${document.external_reference}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <div
                      className={`text-lg font-black tabular-nums ${
                        isReceipt ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatAmount(document.currency_code, document.amount)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDocument(document)}
                      className="inline-flex min-h-[38px] items-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 shrink-0 cursor-pointer"
                    >
                      View details
                    </button>
                  </div>
                </div>

                {document.description && (
                  <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{document.description}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                      <Clock3 size={14} className="text-slate-500" />
                      Approval progress: {document.approval_steps_completed}/{document.approval_steps_total} steps approved
                    </span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                      <div
                        className={`h-full rounded-full ${
                          document.status === 'rejected' ? 'bg-rose-500' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${progressRatio}%` }}
                      />
                    </div>
                  </div>
                  <span className={`font-medium ${document.journal_entry_id ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {document.journal_entry_id
                      ? `Journal linked: ${document.journal_entry_id}`
                      : 'Journal not yet linked'}
                  </span>
                </div>

                {document.approval_steps.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {document.approval_steps.map(step => (
                      <div key={step.id} className="space-y-1">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
                            step.status
                          )}`}
                        >
                          Step {step.step_order}: {step.status}
                          {step.decision ? ` · Decision: ${step.decision}` : ''}
                        </span>
                        {step.comments && (
                          <p className="max-w-2xl rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            <strong>{step.decision === 'rejected' ? 'Rejection reason:' : 'Decision comment:'}</strong>{' '}
                            {step.comments}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canDecide && (
                  <div className="mt-3 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <label
                      className="block text-xs font-bold text-slate-800"
                      htmlFor={`approval-comment-${document.id}`}
                    >
                      Decision comments (optional)
                    </label>
                    <textarea
                      id={`approval-comment-${document.id}`}
                      rows={2}
                      placeholder="Add optional review or rejection notes…"
                      className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                      value={comments[document.id] || ''}
                      onChange={event =>
                        setComments(current => ({ ...current, [document.id]: event.target.value }))
                      }
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyStepId === document.actor_approval_step_id}
                        onClick={() => void decide(document, 'rejected')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50 shrink-0 cursor-pointer"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                      <button
                        type="button"
                        disabled={busyStepId === document.actor_approval_step_id}
                        onClick={() => void decide(document, 'approved')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 shrink-0 cursor-pointer"
                      >
                        <CheckCircle2 size={14} /> Approve
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedDocument && (() => {
        const selectedIsReceipt = selectedDocument.document_type === 'receipt';
        const selectedReference = `${selectedIsReceipt ? 'REC' : 'PAY'}-${String(selectedDocument.document_number).padStart(6, '0')}`;
        return (
          <div className="finance-detail-overlay" role="dialog" aria-modal="true" aria-label="Financial document detail">
            <div className="finance-detail-panel">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 print:hidden">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Financial document detail</p>
                  <h3 id="finance-document-detail-title" className="text-lg font-black font-mono text-slate-900">
                    {selectedReference}
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
                    aria-label="Close document details"
                    onClick={() => setSelectedDocument(null)}
                    className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="finance-print-sheet pt-4">
                <div className="mb-6 border-b-2 border-slate-900 pb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    Church financial record · {scopeLabel(selectedDocument)}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-slate-900">
                    {selectedIsReceipt ? 'OFFICIAL RECEIPT' : 'PAYMENT VOUCHER'}
                  </h2>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-600">{selectedReference}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase text-slate-500">
                      {selectedIsReceipt ? 'Received from' : 'Paid to'}
                    </p>
                    <p className="mt-1 font-bold text-slate-900">{selectedDocument.payee_or_payer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Transaction date</p>
                    <p className="mt-1 font-bold tabular-nums text-slate-900">{selectedDocument.transaction_date}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Amount</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                      {formatAmount(selectedDocument.currency_code, selectedDocument.amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Payment method</p>
                    <p className="mt-1 font-bold capitalize text-slate-900">
                      {selectedDocument.payment_method?.replace('_', ' ') || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Status</p>
                    <p className="mt-1 font-bold capitalize text-slate-900">
                      {selectedDocument.status.replace('_', ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">External reference</p>
                    <p className="mt-1 font-bold text-slate-900">{selectedDocument.external_reference || '—'}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-lg border border-slate-200 p-4">
                  <p className="text-xs uppercase text-slate-500">Description / purpose</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                    {selectedDocument.description || '—'}
                  </p>
                </div>
                <div className="mt-5 grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
                  <p className="font-mono">Document ID: {selectedDocument.id}</p>
                  <p className="font-mono">Journal entry: {selectedDocument.journal_entry_id || 'Not yet linked'}</p>
                  <p>
                    Approval progress: {selectedDocument.approval_steps_completed}/{selectedDocument.approval_steps_total}
                  </p>
                  <p className="font-mono">Approval request: {selectedDocument.approval_request_id || '—'}</p>
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
                <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-slate-500">
                  <div className="border-t border-slate-400 pt-2">Prepared / received by</div>
                  <div className="border-t border-slate-400 pt-2">Authorised by</div>
                </div>
                <p className="mt-8 text-center text-[10px] text-slate-400">
                  This printout records the transaction workflow status. It is not proof of posting unless the status is posted.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      <p className="text-xs text-slate-400">
        Signed in profile: <span className="font-mono">{actorId || 'Not available'}</span>. Approval decisions are re-verified by the transaction service.
      </p>
    </section>
  );
};

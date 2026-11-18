import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { decideFinanceWorkflowApproval, getFinanceWorkflowDocuments, type FinanceWorkflowDocument } from './financeDocumentWorkflowService';

interface Props { branchId: string | null; }

const statusClass = (status: string) => {
  if (status === 'approved' || status === 'posted') return 'bg-emerald-100 text-emerald-800';
  if (status === 'rejected') return 'bg-rose-100 text-rose-800';
  return 'bg-amber-100 text-amber-800';
};

export const FinanceDocumentWorkflowWorkspace: React.FC<Props> = ({ branchId }) => {
  const [documents, setDocuments] = useState<FinanceWorkflowDocument[]>([]);
  const [actorId, setActorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getFinanceWorkflowDocuments(branchId);
    if (result.error) {
      setError(result.error.message);
      setDocuments([]);
      setActorId(null);
    } else {
      setDocuments(result.data?.documents || []);
      setActorId(result.data?.actor_profile_id || null);
    }
    setLoading(false);
  }, [branchId]);

  useEffect(() => { void reload(); }, [reload]);

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
      setNotice(decision === 'approved'
        ? 'Approval decision recorded. The document remains pending if further approval steps are required.'
        : 'Document rejected. Its draft journal remains unlinked and cannot be posted.');
      setComments(current => ({ ...current, [document.id]: '' }));
      await reload();
    }
    setBusyStepId(null);
  };

  const pendingCount = documents.filter(document => document.status === 'pending_approval').length;
  const actionableCount = documents.filter(document => document.actor_approval_step_id).length;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900"><ShieldCheck size={19} /> Financial documents & approvals</h3>
          <p className="mt-1 text-sm text-slate-500">Canonical receipts and payments with approval progress. Draft journals are not posted ledger balances.</p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={17} />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} />{notice}</div>}

      {!loading && !error && <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Documents</div><div className="text-xl font-black">{documents.length}</div></div>
        <div className="rounded-xl bg-amber-50 p-3"><div className="text-xs text-amber-700">Awaiting approval</div><div className="text-xl font-black text-amber-900">{pendingCount}</div></div>
        <div className="rounded-xl bg-indigo-50 p-3"><div className="text-xs text-indigo-700">Awaiting my decision</div><div className="text-xl font-black text-indigo-900">{actionableCount}</div></div>
      </div>}

      {loading ? <p className="py-6 text-center text-sm text-slate-500">Loading canonical financial documents…</p> :
        documents.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">No financial documents are available in this branch yet.</p> :
        <div className="space-y-3">
          {documents.map(document => {
            const isReceipt = document.document_type === 'receipt';
            const canDecide = Boolean(document.actor_approval_step_id && document.status === 'pending_approval');
            return <article key={document.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${isReceipt ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{document.document_type}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClass(document.status)}`}>{document.status.replace('_', ' ')}</span>
                  </div>
                  <h4 className="mt-2 font-bold text-slate-900">{document.payee_or_payer_name}</h4>
                  <p className="text-xs text-slate-500">{document.id} · {document.transaction_date} · {document.payment_method?.replace('_', ' ')}</p>
                </div>
                <div className={`text-lg font-black ${isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>{document.currency_code} {Number(document.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              {document.description && <p className="mt-2 text-sm text-slate-600">{document.description}</p>}
              {document.external_reference && <p className="mt-1 text-xs text-slate-500">Reference: {document.external_reference}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Clock3 size={14} />
                Approval progress: {document.approval_steps_completed}/{document.approval_steps_total} steps approved
                {document.journal_entry_id && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Journal linked: {document.journal_entry_id}</span>}
                {!document.journal_entry_id && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Journal not yet linked</span>}
              </div>
              {document.approval_steps.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
                {document.approval_steps.map(step => <span key={step.id} className={`rounded-full px-2 py-1 text-[10px] ${statusClass(step.status)}`}>Step {step.step_order}: {step.status}</span>)}
              </div>}
              {canDecide && <div className="mt-3 space-y-2 rounded-lg bg-indigo-50 p-3">
                <label className="block text-xs font-bold text-indigo-900" htmlFor={`approval-comment-${document.id}`}>Decision comments (optional)</label>
                <textarea id={`approval-comment-${document.id}`} rows={2} className="w-full rounded-lg border border-indigo-200 bg-white p-2 text-sm" value={comments[document.id] || ''} onChange={event => setComments(current => ({ ...current, [document.id]: event.target.value }))} />
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" disabled={busyStepId === document.actor_approval_step_id} onClick={() => void decide(document, 'rejected')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><XCircle size={14} /> Reject</button>
                  <button type="button" disabled={busyStepId === document.actor_approval_step_id} onClick={() => void decide(document, 'approved')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 size={14} /> Approve</button>
                </div>
              </div>}
            </article>;
          })}
        </div>}
      <p className="text-xs text-slate-400">Signed in profile: {actorId || 'Not available'}. Approval decisions are checked again by the transaction service; hiding an action in this interface is not an authorization boundary.</p>
    </section>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRightLeft, Check, Clock, RefreshCw, X } from 'lucide-react';
import {
  getMemberTransferDirectory,
  getMemberTransfers,
  requestMemberTransfer,
  reviewMemberTransfer,
  cancelMemberTransfer
} from './memberTransferService';
import type { ChurchBranch, MemberTransfer, Profile } from './types';

interface MemberTransfersAdminTabProps {
  profile: Profile;
}

interface TransferMemberOption {
  id: string;
  first_name: string;
  last_name: string;
  branch_id: string | null;
  membership_status: string;
}

export const MemberTransfersAdminTab: React.FC<MemberTransfersAdminTabProps> = ({ profile }) => {
  const [transfers, setTransfers] = useState<MemberTransfer[]>([]);
  const [members, setMembers] = useState<TransferMemberOption[]>([]);
  const [branches, setBranches] = useState<ChurchBranch[]>([]);
  const [memberId, setMemberId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [transferRows, directory] = await Promise.all([
        getMemberTransfers(),
        getMemberTransferDirectory()
      ]);
      setTransfers(transferRows);
      setMembers(directory.members || []);
      setBranches(directory.branches || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load member transfer data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const memberMap = useMemo(() => new Map(members.map(member => [
    member.id,
    `${member.first_name} ${member.last_name}`.trim()
  ])), [members]);

  const branchById = useMemo(
    () => new Map(branches.map(branch => [branch.id, branch])),
    [branches]
  );

  const formatBranchLabel = useCallback((branchIdValue: string | null | undefined, fallback: string) => {
    if (!branchIdValue) return fallback;
    const branch = branchById.get(branchIdValue);
    if (!branch) return fallback;
    const districtLabel = branch.district_id
      ? branch.district_name || 'Assigned District'
      : 'Standalone (Church-Wide)';
    return `${branch.name} (${districtLabel})`;
  }, [branchById]);

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The transfer operation could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!memberId || !toBranchId) return;
    await runAction(
      () => requestMemberTransfer({ memberId, toBranchId, notes }),
      'Transfer request created.'
    );
    setMemberId('');
    setToBranchId('');
    setNotes('');
  };

  const activeBranches = useMemo(
    () => branches.filter(branch => (branch.status || 'active') === 'active'),
    [branches]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ArrowRightLeft size={20} className="text-indigo-600" />
            Member Transfers
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Review branch relocation requests. Approval atomically updates the member&apos;s branch (and derived district), deactivates source-branch ministry rosters while preserving history and church-wide teams.
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Signed in as {profile.first_name} {profile.last_name}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || busy}
          className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" />{error}</div>}
      {message && <div role="status" className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm">{message}</div>}

      <form onSubmit={handleRequest} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="font-extrabold text-slate-900">Create a transfer request</h3>
          <p className="text-xs text-slate-500 mt-1">Only members and active destination branches visible within your authorized scope are listed.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs font-bold text-slate-600 space-y-1">
            <span>Church member</span>
            <select value={memberId} onChange={event => setMemberId(event.target.value)} required
              className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 bg-white text-sm">
              <option value="">Select member</option>
              {members.filter(member => member.membership_status === 'active' && member.branch_id).map(member => (
                <option key={member.id} value={member.id}>
                  {member.first_name} {member.last_name} — {formatBranchLabel(member.branch_id, 'Assigned branch')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600 space-y-1">
            <span>Destination branch</span>
            <select value={toBranchId} onChange={event => setToBranchId(event.target.value)} required
              className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 bg-white text-sm">
              <option value="">Select destination</option>
              {activeBranches.filter(branch => branch.id !== members.find(member => member.id === memberId)?.branch_id).map(branch => (
                <option key={branch.id} value={branch.id}>
                  {formatBranchLabel(branch.id, branch.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600 space-y-1">
            <span>Notes (optional)</span>
            <input value={notes} onChange={event => setNotes(event.target.value)} maxLength={500}
              placeholder="Reason or supporting notes"
              className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 bg-white text-sm" />
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={busy || !memberId || !toBranchId}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">
            Create request
          </button>
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-slate-900">Transfer history</h3>
            <p className="text-xs text-slate-500 mt-0.5">{transfers.length} visible request(s)</p>
          </div>
        </div>
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading transfer requests…</div> :
          transfers.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No transfer requests are visible in your authorized branch scope.</div> :
          <div className="divide-y divide-slate-100">
            {transfers.map(transfer => (
              <div key={transfer.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900">{memberMap.get(transfer.member_id) || 'Church member'}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {formatBranchLabel(transfer.from_branch_id, 'Unassigned branch')}
                    <span className="mx-2">→</span>
                    {formatBranchLabel(transfer.to_branch_id, 'Destination branch')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Requested {new Date(transfer.requested_at).toLocaleString()} {transfer.notes ? `· ${transfer.notes}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${transfer.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : transfer.status === 'rejected' || transfer.status === 'cancelled' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>
                    {transfer.status}
                  </span>
                  {transfer.status === 'pending' && (
                    <>
                      <button type="button" disabled={busy} onClick={() => void runAction(() => reviewMemberTransfer(transfer.id, 'approve'), 'Transfer approved and member branch updated.')}
                        className="min-h-[36px] px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                        <Check size={13} /> Approve
                      </button>
                      <button type="button" disabled={busy} onClick={() => void runAction(() => reviewMemberTransfer(transfer.id, 'reject'), 'Transfer request rejected.')}
                        className="min-h-[36px] px-3 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                        <X size={13} /> Reject
                      </button>
                      <button type="button" disabled={busy} onClick={() => void runAction(() => cancelMemberTransfer(transfer.id), 'Transfer request cancelled.')}
                        title="Cancel request" className="min-h-[36px] w-9 rounded-lg border border-slate-200 text-slate-500 inline-flex items-center justify-center disabled:opacity-50">
                        <Clock size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
};

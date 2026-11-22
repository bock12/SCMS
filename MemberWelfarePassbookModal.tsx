import React, { useState } from 'react';
import {
  CreditCard,
  X,
  Printer,
  Download,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import {
  buildPassbookCsv,
  getWelfareReasonLabel,
  type MemberPassbookDetail
} from './welfareContributionService';
import type { ContributionCategory } from './types';

export interface MemberWelfarePassbookModalProps {
  detail: MemberPassbookDetail;
  churchName?: string;
  onClose: () => void;
  onRecordContribution?: (member: { id: string; name: string }) => void;
}

const formatCategoryLabel = (category: ContributionCategory): string => {
  switch (category) {
    case 'welfare':
      return 'Welfare Fund';
    case 'monthly_dues':
      return 'Monthly Dues';
    case 'special_support':
      return 'Special Support';
  }
};

const formatPaymentMethod = (method: string): string => {
  switch (method) {
    case 'mobile_money':
      return 'Mobile Money';
    case 'bank_transfer':
      return 'Bank Transfer';
    case 'card':
      return 'Card';
    default:
      return 'Cash';
  }
};

export const MemberWelfarePassbookModal: React.FC<MemberWelfarePassbookModalProps> = ({
  detail,
  churchName = 'FaithConnect · Grace Cathedral',
  onClose,
  onRecordContribution
}) => {
  const [activeView, setActiveView] = useState<'overview' | 'statement'>('overview');
  const { card, entries, reciprocity, duesMatrix } = detail;
  const currency = card.currency || 'SLE';
  const totalContributed =
    card.total_welfare_paid + card.total_dues_paid + card.total_support_paid;
  const paidMonthsCount = duesMatrix.filter(cell => cell.status === 'paid').length;

  const handleDownloadCsv = () => {
    const csv = buildPassbookCsv(detail);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `welfare-passbook-${card.card_number.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintPassbook = () => {
    window.print();
  };

  const renderStandingIcon = () => {
    if (card.status === 'Good Standing') {
      return <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />;
    }
    if (card.status === 'Restricted Standing') {
      return <AlertTriangle size={14} className="text-rose-400 shrink-0" />;
    }
    return <Clock size={14} className="text-amber-300 shrink-0" />;
  };

  return (
    <>
      {/* Interactive Modal (hidden when printing) */}
      <div
        className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-slate-900/65 backdrop-blur-[1px] p-0 sm:p-4 print:hidden"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="welfare-passbook-modal-title"
          onClick={e => e.stopPropagation()}
          className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-4 sm:px-6 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <CreditCard size={20} className="text-indigo-600 shrink-0" />
              <div className="min-w-0">
                <h3
                  id="welfare-passbook-modal-title"
                  className="text-base sm:text-lg font-black text-slate-900 truncate"
                >
                  Member Digital Welfare Passbook
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {card.department_name} · {card.card_number}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close welfare passbook"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Sub-view Switcher */}
          <div className="px-5 pt-3 sm:px-6 flex items-center justify-between gap-3 shrink-0">
            <div
              role="tablist"
              aria-label="Passbook sections"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'overview'}
                onClick={() => setActiveView('overview')}
                className={`flex-1 sm:flex-initial min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  activeView === 'overview'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Passbook & Dues Tracker
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'statement'}
                onClick={() => setActiveView('statement')}
                className={`flex-1 sm:flex-initial min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  activeView === 'statement'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Stamped Statement ({entries.length})
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
            {activeView === 'overview' ? (
              <>
                {/* Digital Passbook Card */}
                <div className="bg-slate-900 rounded-2xl p-5 text-white border border-slate-800 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-indigo-300 truncate">
                        {churchName}
                      </div>
                      <h4 className="font-extrabold text-sm text-white mt-0.5 truncate">
                        {card.department_name} Passbook
                      </h4>
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-100 shrink-0 whitespace-nowrap">
                      {renderStandingIcon()}
                      <span>{card.status}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 text-white font-black flex items-center justify-center text-xl shrink-0">
                      {card.member_name ? card.member_name[0].toUpperCase() : 'M'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg font-black text-white truncate">
                        {card.member_name}
                      </div>
                      <div className="text-xs font-mono text-indigo-300 mt-0.5 tabular-nums">
                        {card.card_number}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                        Issued {card.issued_date} · Seal {card.verification_code || 'VERIFIED'}
                      </div>
                    </div>
                  </div>

                  {/* Three Contribution Totals */}
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/10">
                    <div>
                      <span className="text-[11px] text-slate-400 block">Welfare Fund</span>
                      <strong className="font-mono text-sm font-black text-white tabular-nums">
                        {currency} {card.total_welfare_paid.toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Monthly Dues</span>
                      <strong className="font-mono text-sm font-black text-white tabular-nums">
                        {currency} {card.total_dues_paid.toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Task Support</span>
                      <strong className="font-mono text-sm font-black text-white tabular-nums">
                        {currency} {card.total_support_paid.toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 tabular-nums">
                    <span>
                      Total Recorded: {currency} {totalContributed.toLocaleString()} ({entries.length}{' '}
                      {entries.length === 1 ? 'entry' : 'entries'})
                    </span>
                    <span className="text-emerald-300 font-bold">
                      Cycle {card.current_cycle || 'Current'}
                    </span>
                  </div>
                </div>

                {/* Reciprocity & Drive Eligibility Summary */}
                <div className="border border-slate-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                      <ShieldCheck size={15} className="text-indigo-600 shrink-0" />
                      <span>Welfare Drive Reciprocity & Eligibility</span>
                    </div>
                    <span className="text-xs font-bold text-slate-700 tabular-nums">
                      {reciprocity.drives_participated_count} / {reciprocity.total_drives_count}{' '}
                      drives ({reciprocity.participation_rate}%)
                    </span>
                  </div>

                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        reciprocity.participation_rate >= 80
                          ? 'bg-emerald-600'
                          : reciprocity.participation_rate >= 50
                          ? 'bg-amber-500'
                          : 'bg-rose-600'
                      }`}
                      style={{ width: `${reciprocity.participation_rate}%` }}
                    />
                  </div>

                  <p className="text-xs text-slate-600">
                    <strong className="text-slate-800">{reciprocity.standing_label}:</strong>{' '}
                    {reciprocity.welfare_eligibility_note}
                  </p>

                  {reciprocity.outstanding_drives.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
                      <div className="font-bold text-amber-800">
                        Outstanding Peer Welfare Drives ({reciprocity.outstanding_drives.length}):
                      </div>
                      <ul className="space-y-1 text-slate-600">
                        {reciprocity.outstanding_drives.map(drive => (
                          <li key={drive.id} className="flex items-center justify-between gap-2">
                            <span className="truncate">{drive.title}</span>
                            <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                              {currency} {drive.expected_amount_per_member.toLocaleString()} · Due{' '}
                              {drive.deadline}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* 12-Month Annual Dues Matrix */}
                <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900">
                        Annual Monthly Dues Matrix ({duesMatrix[0]?.monthKey.slice(0, 4)})
                      </h4>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {paidMonthsCount} of 12 months settled · Standard rate {currency}{' '}
                        {(card.expected_monthly_dues ?? 200).toLocaleString()}/mo
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {duesMatrix.map(cell => {
                      const statusStyles =
                        cell.status === 'paid'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : cell.status === 'partial'
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : cell.status === 'pending'
                          ? 'bg-rose-50/70 border-rose-200 text-rose-800'
                          : 'bg-slate-50 border-slate-200 text-slate-400';

                      const statusText =
                        cell.status === 'paid'
                          ? 'Paid'
                          : cell.status === 'partial'
                          ? 'Partial'
                          : cell.status === 'pending'
                          ? 'Due'
                          : 'Future';

                      return (
                        <div
                          key={cell.monthKey}
                          className={`px-2.5 py-2 rounded-xl border text-center ${statusStyles}`}
                        >
                          <div className="text-[11px] font-extrabold">{cell.label}</div>
                          <div className="text-[10px] font-semibold mt-0.5 tabular-nums">
                            {cell.paidAmount > 0
                              ? `${currency} ${cell.paidAmount.toLocaleString()}`
                              : statusText}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              /* Stamped Contribution Statement Table */
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">
                      Chronological Passbook Statement
                    </h4>
                    <p className="text-xs text-slate-500">
                      Every stamped welfare, dues, and special support entry for {card.member_name}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet size={14} /> Export CSV
                  </button>
                </div>

                {entries.length === 0 ? (
                  <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center text-xs text-slate-500">
                    No contributions have been recorded on this passbook yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                          <tr>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Category & Details</th>
                            <th className="py-2.5 px-3">Method / Ref</th>
                            <th className="py-2.5 px-3">Recorded By</th>
                            <th className="py-2.5 px-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {entries.map(entry => {
                            const detailText =
                              entry.category === 'monthly_dues'
                                ? `Cycle ${entry.period_month_year || entry.date.slice(0, 7)}`
                                : entry.category === 'special_support'
                                ? entry.special_support_purpose || 'Special Project Pledge'
                                : getWelfareReasonLabel(entry.welfare_reason);

                            return (
                              <tr key={entry.id} className="hover:bg-slate-50/70">
                                <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                                  {entry.date.slice(0, 10)}
                                </td>
                                <td className="py-2.5 px-3 min-w-[160px]">
                                  <div className="font-bold text-slate-900">
                                    {formatCategoryLabel(entry.category)}
                                  </div>
                                  <div className="text-[11px] text-slate-500">{detailText}</div>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="text-slate-700 font-medium">
                                    {formatPaymentMethod(entry.payment_method)}
                                  </div>
                                  {entry.transaction_ref && (
                                    <div className="font-mono text-[11px] text-slate-400">
                                      {entry.transaction_ref}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                  {entry.recorded_by}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap tabular-nums">
                                  {entry.currency || currency}{' '}
                                  {Number(entry.amount).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-4 sm:px-6 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintPassbook}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Printer size={14} /> Print Passbook
              </button>
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Download size={14} /> CSV Statement
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {onRecordContribution && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRecordContribution({ id: card.member_id, name: card.member_name });
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Plus size={14} /> Log Contribution
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Safe In-DOM Print Sheet (no window.open / no raw HTML interpolation) */}
      <div className="hidden print:block fixed inset-0 bg-white text-slate-900 p-8 z-[9999] overflow-visible">
        <div className="max-w-2xl mx-auto border border-slate-300 rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between border-b border-slate-200 pb-4">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase">{churchName}</div>
              <h1 className="text-xl font-black text-slate-900 mt-0.5">
                {card.department_name} — Official Welfare Passbook
              </h1>
              <div className="text-xs font-mono text-slate-600 mt-1">
                Card ID: {card.card_number} · Seal: {card.verification_code}
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="font-bold text-slate-900">{card.member_name}</div>
              <div className="text-slate-600">Status: {card.status}</div>
              <div className="text-slate-500">Issued: {card.issued_date}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center border-b border-slate-200 pb-4">
            <div className="p-2 border border-slate-200 rounded-lg">
              <div className="text-[11px] text-slate-500 font-semibold">Welfare Fund</div>
              <div className="font-mono font-black text-sm tabular-nums">
                {currency} {card.total_welfare_paid.toLocaleString()}
              </div>
            </div>
            <div className="p-2 border border-slate-200 rounded-lg">
              <div className="text-[11px] text-slate-500 font-semibold">Monthly Dues</div>
              <div className="font-mono font-black text-sm tabular-nums">
                {currency} {card.total_dues_paid.toLocaleString()}
              </div>
            </div>
            <div className="p-2 border border-slate-200 rounded-lg">
              <div className="text-[11px] text-slate-500 font-semibold">Task Support</div>
              <div className="font-mono font-black text-sm tabular-nums">
                {currency} {card.total_support_paid.toLocaleString()}
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-extrabold uppercase text-slate-600 mb-2">
              Stamped Contributions ({entries.length})
            </h2>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600">
                  <th className="py-1.5">Date</th>
                  <th className="py-1.5">Category</th>
                  <th className="py-1.5">Method / Ref</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="py-1.5 font-mono tabular-nums">{entry.date.slice(0, 10)}</td>
                    <td className="py-1.5">{formatCategoryLabel(entry.category)}</td>
                    <td className="py-1.5">
                      {formatPaymentMethod(entry.payment_method)}
                      {entry.transaction_ref ? ` (${entry.transaction_ref})` : ''}
                    </td>
                    <td className="py-1.5 text-right font-mono font-bold tabular-nums">
                      {entry.currency || currency} {Number(entry.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

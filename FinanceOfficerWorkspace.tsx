import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { Profile, FinancialRecord, GivingConfig, MobileMoneyGateway, GivingFund, DepartmentRequisition, RequisitionItem, EventBudgetApproval } from './types';
import { getGivingConfig, saveGivingConfig } from './givingConfig';
import { getRequisitions, saveRequisitions, getDepartmentFinancialStanding } from './requisitionService';
import { getEventBudgetApprovals, approveEventBudget, rejectEventBudget, disburseEventBudget as executeDisburseEventBudget } from './eventBudgetService';
import { getChurchProfile } from './churchProfileService';
import { 
  DollarSign, Sliders, Plus, Clock, Check, X, Printer, Filter, 
  Search, Landmark, Smartphone, RefreshCw, Layers, ShieldCheck, 
  Trash2, Edit, AlertCircle, FileText, CheckCircle2, ArrowRightLeft,
  Download, ArrowUpRight, ArrowDownRight, PieChart, Calendar, ShoppingCart, Send, FileCode, CheckSquare, Shield, Upload, Bell, CheckCircle
} from 'lucide-react';
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

interface FinanceOfficerWorkspaceProps {
  profile: Profile | null;
}

export const FinanceOfficerWorkspace: React.FC<FinanceOfficerWorkspaceProps> = ({ profile }) => {
  const [workspaceTab, setWorkspaceTab] = useState<'ledger' | 'requisitions' | 'event_budgets' | 'gateways'>('ledger');
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [givingConfig, setGivingConfig] = useState<GivingConfig>(getGivingConfig());
  const [churchProfile, setChurchProfile] = useState(getChurchProfile());

  useEffect(() => {
    const handleProfileUpdate = () => setChurchProfile(getChurchProfile());
    window.addEventListener('church-profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('church-profile-updated', handleProfileUpdate);
  }, []);

  // Requisitions & Event Budgets State
  const [requisitions, setRequisitions] = useState<DepartmentRequisition[]>([]);
  const [eventBudgets, setEventBudgets] = useState<EventBudgetApproval[]>([]);

  // Sync Requisitions and Event Budgets with Service
  const reloadRequisitions = () => {
    setRequisitions(getRequisitions());
    setEventBudgets(getEventBudgetApprovals());
  };

  useEffect(() => {
    reloadRequisitions();
    const handleUpdate = () => reloadRequisitions();
    window.addEventListener('requisitions_updated', handleUpdate);
    window.addEventListener('event_budgets_updated', handleUpdate);
    return () => {
      window.removeEventListener('requisitions_updated', handleUpdate);
      window.removeEventListener('event_budgets_updated', handleUpdate);
    };
  }, []);

  // Ledger Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'week' | 'month' | 'quarter' | 'year'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_verification' | 'completed' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Ledger Modals
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState<FinancialRecord | null>(null);

  // Member Roster & Selection State for Contributor & Payee
  const [membersList, setMembersList] = useState<Profile[]>([]);
  const [incomeContributorType, setIncomeContributorType] = useState<'member' | 'non_member'>('member');
  const [selectedIncomeMemberId, setSelectedIncomeMemberId] = useState<string>('');
  const [expensePayeeType, setExpensePayeeType] = useState<'non_member' | 'member'>('non_member');
  const [selectedExpenseMemberId, setSelectedExpenseMemberId] = useState<string>('');

  // Income Form State
  const [contributor, setContributor] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedFundId, setSelectedFundId] = useState('f1');
  const [customFundInput, setCustomFundInput] = useState('');
  const [incomeFrequency, setIncomeFrequency] = useState<'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'>('one_time');
  const [method, setMethod] = useState<'cash' | 'mobile_money' | 'bank_transfer' | 'card'>('cash');
  const [senderPhone, setSenderPhone] = useState('');
  const [txnId, setTxnId] = useState('');
  const [notes, setNotes] = useState('');

  // Expense Form State
  const [expensePayee, setExpensePayee] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Utilities & Electricity');
  const [expenseMethod, setExpenseMethod] = useState<'bank_transfer' | 'cash' | 'mobile_money' | 'check'>('bank_transfer');
  const [expenseRef, setExpenseRef] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');

  const fetchMembers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('first_name', { ascending: true });
    if (data && data.length > 0) {
      setMembersList(data as unknown as Profile[]);
    } else {
      setMembersList([
        { id: 'm-1', first_name: 'Grace', last_name: 'Campbell', primary_role: 'Congregant', phone: '077 444 555', email: 'grace@cathedral.org' } as any,
        { id: 'm-2', first_name: 'Sahr', last_name: 'Sesay', primary_role: 'Financial Officer', phone: '076 100 200', email: 'sahr@cathedral.org' } as any,
        { id: 'm-3', first_name: 'David', last_name: 'Miller', primary_role: 'Deacon', phone: '078 123 456', email: 'david@cathedral.org' } as any,
        { id: 'm-4', first_name: 'Hannah', last_name: 'Adams', primary_role: 'Worship Lead', phone: '079 888 999', email: 'hannah@cathedral.org' } as any,
        { id: 'm-5', first_name: 'Rev. Sarah', last_name: 'Johnson', primary_role: 'Senior Pastor', phone: '076 999 000', email: 'pastor@cathedral.org' } as any,
      ]);
    }
  };

  const handleSelectIncomeMember = (memberId: string) => {
    setSelectedIncomeMemberId(memberId);
    if (memberId === 'custom') {
      setIncomeContributorType('non_member');
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

  const handleSelectExpensePayee = (memberId: string) => {
    setSelectedExpenseMemberId(memberId);
    if (memberId === 'custom') {
      setExpensePayeeType('non_member');
      setExpensePayee('');
      return;
    }
    const found = membersList.find(m => m.id === memberId);
    if (found) {
      setExpensePayee(`${found.first_name} ${found.last_name}`);
    }
  };

  // Invoicing & Disbursement Modal State
  const [disburseReq, setDisburseReq] = useState<DepartmentRequisition | null>(null);
  const [disbursementTxnRef, setDisbursementTxnRef] = useState('');
  const [vendorReceiptUrl, setVendorReceiptUrl] = useState('');
  const [disbursementInvoiceNo, setDisbursementInvoiceNo] = useState('');

  // Event Budget Disbursement Modal State
  const [disburseEventBudget, setDisburseEventBudget] = useState<EventBudgetApproval | null>(null);
  const [evtDisburseChannel, setEvtDisburseChannel] = useState<'mobile_money' | 'bank_transfer' | 'cash'>('mobile_money');
  const [evtDisburseAccountInfo, setEvtDisburseAccountInfo] = useState('');
  const [evtDisburseTxnRef, setEvtDisburseTxnRef] = useState('');
  const [evtDisburseProofUrl, setEvtDisburseProofUrl] = useState('');
  const [evtDisburseSuccessMsg, setEvtDisburseSuccessMsg] = useState<string | null>(null);

  // Mobile Money Provider Form State
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

  // Fund Form State
  const [newFundName, setNewFundName] = useState('');
  const [newFundDesc, setNewFundDesc] = useState('');

  const fetchRecords = async () => {
    setLoading(true);
    const { data } = await supabase.from('financial_records').select('*').order('date', { ascending: false });
    if (data && data.length > 0) {
      setRecords(data as unknown as FinancialRecord[]);
    } else {
      setRecords([
        {
          id: 'rec-1',
          contributor_name: 'Grace Campbell',
          type: 'income',
          category: 'Tithe',
          amount: 1500,
          currency: 'SLE',
          date: new Date(Date.now() - 3600000 * 5).toISOString(),
          payment_method: 'mobile_money',
          status: 'pending_verification',
          frequency: 'monthly',
          sender_phone: '077 444 555',
          transaction_id: 'AFRI-88912',
          notes: '10% Covenant Tithe for October'
        },
        {
          id: 'rec-2',
          contributor_name: 'Sierra Leone Electricity Co (EDSA)',
          type: 'expense',
          category: 'Utilities & Electricity',
          amount: 2400,
          currency: 'SLE',
          date: new Date(Date.now() - 3600000 * 18).toISOString(),
          payment_method: 'bank_transfer',
          status: 'completed',
          approved_by: 'Rev. Sarah Johnson',
          transaction_id: 'EDSA-UTIL-9912',
          notes: 'Sanctuary October Power Grid Bill'
        },
        {
          id: 'rec-3',
          contributor_name: 'Sahr Sesay',
          type: 'income',
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
          id: 'rec-4',
          contributor_name: 'Grace Cathedral Choir Dept',
          type: 'expense',
          category: 'Ministry & Worship Budgets',
          amount: 1800,
          currency: 'SLE',
          date: new Date(Date.now() - 86400000 * 2).toISOString(),
          payment_method: 'cash',
          status: 'completed',
          approved_by: 'Hannah Adams',
          notes: 'Choir Robes Dry Cleaning & Easter Music Sheets'
        }
      ]);
    }
    setLoading(false);
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

  // --- RECORD VERIFICATION ACTIONS ---
  const handleApproveRecord = async (recordId: string) => {
    await supabase.from('financial_records').update({ status: 'completed' }).eq('id', recordId);
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status: 'completed' } : r));
  };

  const handleRejectRecord = async (recordId: string) => {
    if (!confirm("Are you sure you want to flag/reject this transaction entry?")) return;
    await supabase.from('financial_records').update({ status: 'rejected' }).eq('id', recordId);
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status: 'rejected' } : r));
  };

  // --- SAVE INCOME ENTRY ---
  const handleSaveIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    let fundName = 'Tithe';
    if (selectedFundId === 'custom_fund') {
      fundName = customFundInput.trim() || 'Custom Fund';
    } else {
      const found = givingConfig.funds.find(f => f.id === selectedFundId);
      if (found) fundName = found.name;
    }

    const newRecord: Partial<FinancialRecord> = {
      contributor_name: contributor.trim() || 'Anonymous Congregant',
      type: 'income',
      category: fundName,
      amount: Number(amount),
      currency: givingConfig.currency_symbol || 'SLE',
      date: new Date().toISOString(),
      payment_method: method,
      status: method === 'cash' || method === 'card' ? 'completed' : 'pending_verification',
      is_recurring: incomeFrequency !== 'one_time',
      frequency: incomeFrequency,
      sender_phone: method === 'mobile_money' ? senderPhone.trim() : undefined,
      transaction_id: txnId.trim() || undefined,
      notes: notes.trim() || undefined
    };

    const { data, error } = await supabase.from('financial_records').insert([newRecord]).select().maybeSingle();
    if (!error && data) {
      setRecords(prev => [data as unknown as FinancialRecord, ...prev]);
    } else {
      const mockObj: FinancialRecord = {
        id: `rec-${Date.now()}`,
        contributor_name: newRecord.contributor_name!,
        type: 'income',
        category: newRecord.category!,
        amount: newRecord.amount!,
        currency: newRecord.currency,
        date: newRecord.date!,
        payment_method: newRecord.payment_method!,
        status: newRecord.status,
        frequency: newRecord.frequency,
        sender_phone: newRecord.sender_phone,
        transaction_id: newRecord.transaction_id,
        notes: newRecord.notes
      };
      setRecords(prev => [mockObj, ...prev]);
    }

    setShowIncomeModal(false);
    setContributor('');
    setAmount('');
    setSenderPhone('');
    setTxnId('');
    setNotes('');
  };

  // --- SAVE EXPENSE ENTRY ---
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseAmount || Number(expenseAmount) <= 0) return;

    const newRecord: Partial<FinancialRecord> = {
      contributor_name: expensePayee.trim() || 'Vendor / Church Department',
      type: 'expense',
      category: expenseCategory,
      amount: Number(expenseAmount),
      currency: givingConfig.currency_symbol || 'SLE',
      date: new Date().toISOString(),
      payment_method: expenseMethod,
      status: 'completed',
      approved_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer',
      transaction_id: expenseRef.trim() || undefined,
      notes: expenseNotes.trim() || undefined
    };

    const { data, error } = await supabase.from('financial_records').insert([newRecord]).select().maybeSingle();
    if (!error && data) {
      setRecords(prev => [data as unknown as FinancialRecord, ...prev]);
    } else {
      const mockObj: FinancialRecord = {
        id: `rec-${Date.now()}`,
        contributor_name: newRecord.contributor_name!,
        type: 'expense',
        category: newRecord.category!,
        amount: newRecord.amount!,
        currency: newRecord.currency,
        date: newRecord.date!,
        payment_method: newRecord.payment_method!,
        status: 'completed',
        approved_by: newRecord.approved_by,
        transaction_id: newRecord.transaction_id,
        notes: newRecord.notes
      };
      setRecords(prev => [mockObj, ...prev]);
    }

    setShowExpenseModal(false);
    setExpensePayee('');
    setExpenseAmount('');
    setExpenseRef('');
    setExpenseNotes('');
  };

  // --- REQUISITION APPROVAL & INVOICING HANDLERS ---
  const handleEscalateToBoard = (reqId: string) => {
    const note = prompt("Enter triage notes for Senior Pastor & Executive Board review:", "Budget proposal reviewed by Treasury. Requires Pastoral & Board authorization.");
    if (!note) return;
    const updated = requisitions.map(r => r.id === reqId ? { 
      ...r, 
      status: 'submitted_to_board' as const,
      finance_officer_review_notes: note,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile ? `${profile.first_name} ${profile.last_name} (Finance Officer)` : 'Finance Officer'
    } : r);
    setRequisitions(updated);
    saveRequisitions(updated);
    alert("Requisition escalated to Senior Pastor & Executive Board for authorization.");
  };

  const handleSettleRequisition = (reqId: string) => {
    const note = prompt("Enter audit settlement notes (e.g. Verified 100% tax receipts):", "All vendor receipts verified. Closed in Good Standing.");
    if (note === null) return;
    const updated = requisitions.map(r => r.id === reqId ? {
      ...r,
      status: 'settled' as const,
      audit_status: 'good_standing' as const,
      audit_notes: note,
      settled_at: new Date().toISOString(),
      settled_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer'
    } : r);
    setRequisitions(updated);
    saveRequisitions(updated);
    alert("Requisition verified & settled in Good Standing!");
  };

  const handleApproveRequisition = (reqId: string) => {
    const updated = requisitions.map(r => r.id === reqId ? { ...r, status: 'approved' as const } : r);
    setRequisitions(updated);
    saveRequisitions(updated);
  };

  const handleRejectRequisition = (reqId: string) => {
    if (!confirm("Are you sure you want to reject this funding proposal?")) return;
    const updated = requisitions.map(r => r.id === reqId ? { ...r, status: 'rejected' as const } : r);
    setRequisitions(updated);
    saveRequisitions(updated);
  };

  const openDisbursementModal = (req: DepartmentRequisition) => {
    setDisburseReq(req);
    setDisbursementInvoiceNo(`INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setDisbursementTxnRef(`WIRE-SLCB-${Math.floor(100000 + Math.random() * 900000)}`);
    setVendorReceiptUrl(req.vendor_quote_url || 'Vendor_Tax_Receipt_Signed.pdf');
  };

  const handleConfirmInvoiceAndDisbursement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disburseReq) return;

    const txnRef = disbursementTxnRef.trim() || `DISB-SLCB-${Math.floor(100000 + Math.random() * 900000)}`;

    // Update Requisition Status to Disbursed
    const updatedReqs = requisitions.map(r => r.id === disburseReq.id ? { 
      ...r, 
      status: 'disbursed' as const, 
      transaction_ref: txnRef,
      vendor_quote_url: vendorReceiptUrl || r.vendor_quote_url,
      disbursed_at: new Date().toISOString(),
      disbursed_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer / Treasury'
    } : r);

    setRequisitions(updatedReqs);
    saveRequisitions(updatedReqs);

    // Automatically Record Expense in Finance Ledger & Link directly
    const autoExpenseRecord: FinancialRecord = {
      id: `rec-disb-${Date.now()}`,
      contributor_name: `${disburseReq.department_name} (${disburseReq.applicant_name})`,
      type: 'expense',
      category: disburseReq.department_name.includes('Media') ? 'Media & IT Equipment' : 'Ministry & Worship Budgets',
      amount: disburseReq.requested_amount,
      currency: disburseReq.currency || 'SLE',
      date: new Date().toISOString(),
      payment_method: disburseReq.disbursement_method as any || 'bank_transfer',
      status: 'completed',
      approved_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer / Treasury',
      transaction_id: txnRef,
      payment_proof_ref: vendorReceiptUrl.trim() || undefined,
      notes: `Church Expense Invoice ${disbursementInvoiceNo}: ${disburseReq.title}`
    };

    setRecords(prev => [autoExpenseRecord, ...prev]);
    setDisburseReq(null);
    setDisbursementTxnRef('');
    setVendorReceiptUrl('');
    alert(`Expense Invoice ${disbursementInvoiceNo} processed! SLE ${disburseReq.requested_amount.toLocaleString()} has been disbursed and linked to the Treasury Financial Ledger.`);
  };

  const openEventBudgetDisbursementModal = (b: EventBudgetApproval) => {
    setDisburseEventBudget(b);
    setEvtDisburseTxnRef(`DISB-EVT-${Math.floor(100000 + Math.random() * 900000)}`);
    setEvtDisburseAccountInfo('Afrimoney / Orange Money Ministry Account');
    setEvtDisburseProofUrl('Bank_Payment_Receipt_Signed.pdf');
  };

  const handleConfirmEventBudgetDisbursement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disburseEventBudget) return;

    const txnRef = evtDisburseTxnRef.trim() || `DISB-EVT-${Math.floor(100000 + Math.random() * 900000)}`;

    const autoExpenseRecord: FinancialRecord = {
      id: `rec-evt-disb-${Date.now()}`,
      contributor_name: `Event: ${disburseEventBudget.event_title} (${disburseEventBudget.submitted_by})`,
      type: 'expense',
      category: 'Ministry & Worship Budgets',
      amount: disburseEventBudget.total_budget || 1000,
      currency: 'SLE',
      date: new Date().toISOString(),
      payment_method: evtDisburseChannel as any || 'bank_transfer',
      status: 'completed',
      approved_by: profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer / Treasury',
      transaction_id: txnRef,
      payment_proof_ref: evtDisburseProofUrl.trim() || undefined,
      notes: `Event Budget Disbursement Invoice ${disburseEventBudget.invoice_number || 'INV-EVT'}: ${disburseEventBudget.event_title}`
    };

    setRecords(prev => [autoExpenseRecord, ...prev]);

    executeDisburseEventBudget(
      disburseEventBudget.event_id,
      profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer',
      txnRef,
      evtDisburseChannel,
      `Disbursed SLE ${(disburseEventBudget.total_budget || 0).toLocaleString()} via ${evtDisburseChannel.toUpperCase()} (Ref: ${txnRef}).`
    );

    setEventBudgets(getEventBudgetApprovals());
    setDisburseEventBudget(null);
    setEvtDisburseSuccessMsg(`🎉 Disbursed SLE ${(disburseEventBudget.total_budget || 0).toLocaleString()} for ${disburseEventBudget.event_title}! Transaction ref ${txnRef} recorded into Treasury Ledger.`);
    setTimeout(() => setEvtDisburseSuccessMsg(null), 5000);
  };

  // --- PRINT OFFICIAL REQUISITION VOUCHER & INVOICE ---
  const handlePrintRequisitionVoucher = (req: DepartmentRequisition) => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = getChurchProfile();

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${cp.name} - Expense Invoice & Voucher - ${req.requisition_number}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #0f172a; }
            .header { border-bottom: 3px solid #1e1b4b; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; }
            .logo { font-size: 24px; font-weight: 900; color: #1e1b4b; }
            .sub { font-size: 12px; color: #64748b; font-weight: 600; }
            .req-no { font-size: 18px; font-weight: 900; color: #4338ca; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 12px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 10px; font-size: 10px; uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
            td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
            .total-box { text-align: right; font-size: 18px; font-weight: 900; color: #059669; padding: 15px; background: #ecfdf5; border-radius: 12px; margin-bottom: 30px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 50px; border-top: 2px dashed #cbd5e1; padding-top: 20px; font-size: 11px; }
            .sig-line { border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">${cp.name.toUpperCase()}</div>
              <div class="sub">Treasury Department & Financial Governance Board</div>
            </div>
            <div style="text-align: right;">
              <div class="req-no">${req.requisition_number}</div>
              <div class="sub">Date: ${new Date(req.created_at).toLocaleDateString()}</div>
            </div>
          </div>

          <h2 style="font-size: 18px; margin-bottom: 5px;">CHURCH DISBURSEMENT INVOICE & RECEIPT VOUCHER</h2>
          <p style="font-size: 12px; color: #475569; margin-top: 0;">Official procurement invoice for ministry equipment & operational funding.</p>

          <div class="grid">
            <div>
              <strong>Department / Ministry:</strong> ${req.department_name}<br/>
              <strong>Applicant Lead:</strong> ${req.applicant_name} (${req.applicant_role || 'Lead'})<br/>
              <strong>Proposal Title:</strong> ${req.title}
            </div>
            <div>
              <strong>Priority Level:</strong> ${req.priority.toUpperCase()}<br/>
              <strong>Disbursement Channel:</strong> ${req.disbursement_method?.toUpperCase()}<br/>
              <strong>Payment Account:</strong> ${req.disbursement_account_info || `${cp.name} Treasury Disbursement`}
            </div>
          </div>

          <h3 style="font-size: 14px; margin-bottom: 10px;">Itemized Procurement Invoice Breakdown</h3>
          <table>
            <thead>
              <tr>
                <th>Item Description</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Unit Price (SLE)</th>
                <th style="text-align: right;">Line Total (SLE)</th>
              </tr>
            </thead>
            <tbody>
              ${req.items.map(i => `
                <tr>
                  <td><strong>${i.item_name}</strong></td>
                  <td style="text-align: center;">${i.quantity}</td>
                  <td style="text-align: right;">${i.unit_price.toLocaleString()}</td>
                  <td style="text-align: right;"><strong>${i.total_price.toLocaleString()}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="total-box">
            Total Authorized Disbursement: ${req.currency || 'SLE'} ${req.requested_amount.toLocaleString()}
          </div>

          ${req.transaction_ref ? `
            <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; font-size: 12px; margin-bottom: 30px;">
              <strong>Bank / Voucher Transaction Ref:</strong> ${req.transaction_ref}<br/>
              <strong>Vendor Receipt Ref:</strong> ${req.vendor_quote_url || 'Attached'}<br/>
              <strong>Disbursed Date:</strong> ${req.disbursed_at ? new Date(req.disbursed_at).toLocaleString() : 'Executed'}<br/>
              <strong>Authorized Treasury Officer:</strong> ${req.disbursed_by || 'Finance Officer'}
            </div>
          ` : ''}

          <div class="signatures">
            <div>
              <div class="sig-line"></div>
              <strong>Department Head Signature</strong><br/>
              ${req.applicant_name}
            </div>
            <div>
              <div class="sig-line"></div>
              <strong>Finance Officer Approval</strong><br/>
              ${profile ? `${profile.first_name} ${profile.last_name}` : 'Treasury Controller'}
            </div>
            <div>
              <div class="sig-line"></div>
              <strong>Senior Pastor / Board Sign-off</strong><br/>
              ${cp.senior_pastor || 'Senior Pastor & Board'}
            </div>
          </div>

          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printWin.document.write(html);
    printWin.document.close();
  };

  const handlePrintEventBudgetInvoice = (b: EventBudgetApproval) => {
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const cp = getChurchProfile();

    const items = b.items_breakdown || [];
    const total = b.total_budget || items.reduce((sum, i) => sum + (i.total_price || 0), 0);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${cp.name} - Proforma Invoice ${b.invoice_number || 'INV-EVT'} - ${b.event_title}</title>
          <style>
            @page { size: A4; margin: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              margin: 0; padding: 0; color: #1e293b; background: #ffffff;
              -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
            }
            .invoice-wrapper { width: 100%; max-width: 800px; margin: 0 auto; background: #ffffff; box-sizing: border-box; }
            .header-banner { background: linear-gradient(135deg, #0b3866 0%, #0f4c81 50%, #002060 100%); color: #ffffff; padding: 36px 48px 30px 48px; border-bottom-left-radius: 60px 24px; border-bottom-right-radius: 60px 24px; display: flex; justify-content: space-between; align-items: flex-start; }
            .invoice-title { font-size: 34px; font-weight: 900; letter-spacing: 2px; margin: 0; text-transform: uppercase; }
            .invoice-number { font-size: 14px; font-weight: 800; letter-spacing: 1px; text-align: right; opacity: 0.95; margin-top: 6px; }
            .body-padding { padding: 28px 48px 12px 48px; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
            .meta-box h4 { font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; }
            .meta-box p { font-size: 13px; color: #475569; margin: 2px 0; line-height: 1.5; }
            .date-row { font-size: 13px; color: #334155; font-weight: 600; margin-bottom: 20px; }
            table.items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            table.items-table th { background-color: #0b3866 !important; color: #ffffff !important; font-size: 12px; font-weight: 800; text-align: left; padding: 10px 14px; border: 1px solid #0b3866; text-transform: uppercase; letter-spacing: 0.5px; }
            table.items-table td { padding: 10px 14px; font-size: 13px; color: #334155; border: 1px solid #cbd5e1; }
            table.items-table tr:nth-child(even) td { background-color: #f8fafc; }
            .subtotal-container { display: flex; justify-content: flex-end; margin-bottom: 20px; }
            .subtotal-box { background-color: #0b3866 !important; color: #ffffff !important; padding: 8px 20px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; width: 280px; font-size: 14px; font-weight: 800; }
            .notes-section { margin-bottom: 16px; }
            .notes-section h5 { font-size: 13px; font-weight: 800; color: #1e293b; margin: 0 0 4px 0; }
            .notes-lines { font-size: 12px; color: #64748b; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; line-height: 1.5; }
            .footer-section { padding: 16px 48px 32px 48px; border-top: 1px dashed #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; }
            .payment-info h5 { font-size: 13px; font-weight: 800; color: #1e293b; margin: 0 0 4px 0; }
            .payment-info p { font-size: 12px; color: #475569; margin: 2px 0; }
            .thank-you { font-size: 28px; font-weight: 800; color: #1e293b; font-style: italic; letter-spacing: -0.5px; }
          </style>
        </head>
        <body>
          <div class="invoice-wrapper">
            <div>
              <div class="header-banner">
                <div><h1 class="invoice-title">INVOICE</h1></div>
                <div class="invoice-number">NO: ${b.invoice_number || 'INV-EVT-2026-101'}</div>
              </div>

              <div class="body-padding">
                <div class="meta-grid">
                  <div class="meta-box">
                    <h4>Bill To:</h4>
                    <p><strong>${cp.name} Treasury</strong></p>
                    <p>Finance & Accounts Division</p>
                    <p>${cp.address}</p>
                    <p>${cp.phone} • ${cp.email}</p>
                  </div>
                  <div class="meta-box" style="text-align: right;">
                    <h4>From:</h4>
                    <p><strong>${b.submitted_by}</strong></p>
                    <p>Department / Event: <strong>${b.event_title}</strong></p>
                    <p>Status: <strong>${b.status.toUpperCase()}</strong></p>
                  </div>
                </div>

                <div class="date-row">
                  Date: <strong>${b.invoice_date || new Date(b.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                </div>

                <table class="items-table">
                  <thead>
                    <tr>
                      <th style="width:50%">Description</th>
                      <th style="width:12%; text-align:center">Qty</th>
                      <th style="width:18%; text-align:right">Price</th>
                      <th style="width:20%; text-align:right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map(item => `
                      <tr>
                        <td>${item.description}</td>
                        <td style="text-align:center">${item.quantity || 1}</td>
                        <td style="text-align:right">SLE ${(item.unit_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td style="text-align:right; font-weight:bold">SLE ${(item.total_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    `).join('')}
                    ${items.length === 0 ? `
                      <tr>
                        <td colSpan="4" style="text-align:center; color:#94a3b8; font-style:italic;">Standard Event Budget Allocation</td>
                      </tr>
                    ` : ''}
                  </tbody>
                </table>

                <div class="subtotal-container">
                  <div class="subtotal-box">
                    <span>Sub Total</span>
                    <span>SLE ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div class="notes-section">
                  <h5>Note:</h5>
                  <div class="notes-lines">
                    ${b.notes || 'Proforma Invoice submitted for event budget approval prior to disbursement.'}
                  </div>
                </div>
              </div>
            </div>

            <div class="footer-section">
              <div class="payment-info">
                <h5>Payment Information:</h5>
                <p><strong>Bank:</strong> ${cp.name} Treasury Bank</p>
                <p><strong>Account Info:</strong> ${cp.email}</p>
                <p><strong>Contact:</strong> ${cp.phone}</p>
              </div>
              <div class="thank-you">Thank You!</div>
            </div>
          </div>

          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  // --- MOBILE MONEY GATEWAY CRUD ---
  const handleOpenAddGateway = () => {
    setEditingGatewayId(null);
    setGwProvider('');
    setGwMerchantNumber('');
    setGwMerchantName('Grace Cathedral Ministry');
    setGwInstructions('');
    setShowGatewayForm(true);
  };

  const handleOpenEditGateway = (g: MobileMoneyGateway) => {
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
      const newGw: MobileMoneyGateway = {
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
    if (!confirm("Are you sure you want to delete this Mobile Money payment gateway?")) return;
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

  // --- BANK DETAILS SAVE ---
  const handleSaveBankDetails = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...givingConfig,
      bank_details: {
        bank_name: bankName.trim(),
        account_name: bankAccName.trim(),
        account_number: bankAccNum.trim(),
        swift_code: bankSwift.trim(),
        instructions: givingConfig.bank_details.instructions
      }
    };
    handlePersistConfig(updated);
    alert("Bank Wire details saved successfully.");
  };

  // --- FUND SAVE ---
  const handleAddFund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFundName.trim()) return;

    const newFund: GivingFund = {
      id: `fund-${Date.now()}`,
      name: newFundName.trim(),
      description: newFundDesc.trim(),
      is_active: true
    };

    const updated = { ...givingConfig, funds: [...givingConfig.funds, newFund] };
    handlePersistConfig(updated);
    setNewFundName('');
    setNewFundDesc('');
  };

  const handleToggleFund = (fundId: string) => {
    const updatedFunds = givingConfig.funds.map(f => f.id === fundId ? { ...f, is_active: !f.is_active } : f);
    handlePersistConfig({ ...givingConfig, funds: updatedFunds });
  };

  // --- TIMEFRAME FILTERING LOGIC ---
  const isWithinPeriod = (dateStr: string) => {
    if (periodFilter === 'all') return true;
    const dt = new Date(dateStr);
    const now = new Date();

    if (periodFilter === 'week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
      return dt >= oneWeekAgo;
    }
    if (periodFilter === 'month') {
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    }
    if (periodFilter === 'quarter') {
      const curQuarter = Math.floor(now.getMonth() / 3);
      const dtQuarter = Math.floor(dt.getMonth() / 3);
      return curQuarter === dtQuarter && dt.getFullYear() === now.getFullYear();
    }
    if (periodFilter === 'year') {
      return dt.getFullYear() === now.getFullYear();
    }
    return true;
  };

  const filteredRecords = records.filter(r => {
    const isIncome = r.type !== 'expense';
    const matchesType = typeFilter === 'all' || (typeFilter === 'income' && isIncome) || (typeFilter === 'expense' && !isIncome);
    const matchesPeriod = isWithinPeriod(r.date);
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesCategory = selectedCategoryFilter === 'all' || r.category === selectedCategoryFilter;
    const matchesQuery = searchQuery === '' || 
      r.contributor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.transaction_id && r.transaction_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.sender_phone && r.sender_phone.includes(searchQuery));

    return matchesType && matchesPeriod && matchesStatus && matchesCategory && matchesQuery;
  });

  const periodRecords = records.filter(r => isWithinPeriod(r.date));

  const totalIncome = periodRecords
    .filter(r => r.type !== 'expense' && (r.status === 'completed' || !r.status))
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const totalExpenses = periodRecords
    .filter(r => r.type === 'expense')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const netBalance = totalIncome - totalExpenses;

  const pendingCount = periodRecords.filter(r => r.status === 'pending_verification').length;
  const pendingAmount = periodRecords.filter(r => r.status === 'pending_verification').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const pendingReqsCount = requisitions.filter(r => r.status === 'pending_approval').length;

  // Ministry Spending Breakdown by Department / Category for Pie Chart
  const departmentSpendingData = useMemo(() => {
    const spendingMap: Record<string, number> = {};

    // 1. From financial records (expenses)
    periodRecords.filter(r => r.type === 'expense').forEach(r => {
      const cat = r.category || 'General Administration';
      spendingMap[cat] = (spendingMap[cat] || 0) + Number(r.amount || 0);
    });

    // 2. From department requisitions (disbursed or approved)
    requisitions.filter(req => req.status === 'disbursed' || req.status === 'approved').forEach(req => {
      const dept = req.department_name || 'Ministry Requisitions';
      spendingMap[dept] = (spendingMap[dept] || 0) + Number(req.requested_amount || 0);
    });

    // 3. From event budget approvals (disbursed or approved)
    eventBudgets.filter(b => b.status === 'disbursed' || b.status === 'approved').forEach(b => {
      const dept = b.event_title ? `${b.event_title}` : 'Event Operations';
      spendingMap[dept] = (spendingMap[dept] || 0) + Number(b.total_budget || 0);
    });

    const total = Object.values(spendingMap).reduce((sum, v) => sum + v, 0);

    const palette = [
      '#4f46e5', '#0284c7', '#0d9488', '#16a34a', '#d97706',
      '#dc2626', '#9333ea', '#db2777', '#2563eb', '#64748b'
    ];

    return Object.entries(spendingMap)
      .map(([name, value], idx) => ({
        name,
        value,
        percentage: total > 0 ? ((value / total) * 100).toFixed(1) : '0',
        color: palette[idx % palette.length]
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [periodRecords, requisitions, eventBudgets]);

  // CSV Statement Export
  const downloadCSVReport = () => {
    const headers = ["ID", "Contributor / Payee", "Type", "Category", "Amount (SLE)", "Payment Method", "Status", "Date", "Transaction Ref", "Notes"];
    const rows = filteredRecords.map(r => [
      r.id,
      `"${r.contributor_name.replace(/"/g, '""')}"`,
      r.type || 'income',
      `"${r.category}"`,
      r.amount,
      r.payment_method,
      r.status || 'completed',
      new Date(r.date).toISOString().slice(0, 10),
      `"${(r.transaction_id || '').replace(/"/g, '""')}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `grace_cathedral_treasury_report_${periodFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadFullFinancialPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const cp = getChurchProfile();

    const periodLabel = 
      periodFilter === 'week' ? 'Weekly Financial Statement (Last 7 Days)' :
      periodFilter === 'month' ? `Monthly Financial Statement (${new Date().toLocaleDateString([], { month: 'long', year: 'numeric' })})` :
      periodFilter === 'quarter' ? `Quarterly Financial Statement (Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()})` :
      periodFilter === 'year' ? `Yearly Financial Report (${new Date().getFullYear()})` :
      'All-Time Comprehensive Financial Statement';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${cp.name} - ${periodLabel}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 40px; color: #0f172a; background: #fff; }
            .header { border-bottom: 3px solid #4338ca; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-start; }
            .title { font-size: 26px; font-weight: 900; color: #1e1b4b; margin: 0; }
            .subtitle { font-size: 13px; color: #64748b; font-weight: 600; margin-top: 4px; }
            .badge { background: #e0e7ff; color: #3730a3; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
            
            .summary-cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 25px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
            .card-label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; }
            .card-val { font-size: 20px; font-weight: 900; margin-top: 4px; }
            .val-income { color: #059669; }
            .val-expense { color: #e11d48; }
            .val-net { color: #4338ca; }

            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
            th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
            td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
            .type-income { color: #059669; font-weight: 800; text-transform: uppercase; font-size: 10px; }
            .type-expense { color: #e11d48; font-weight: 800; text-transform: uppercase; font-size: 10px; }

            .sign-block { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; border-top: 2px dashed #e2e8f0; padding-top: 30px; }
            .sign-line { border-bottom: 1px solid #94a3b8; width: 220px; height: 40px; margin-bottom: 8px; }
            .sign-title { font-size: 12px; font-weight: 800; color: #334155; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">${cp.name.toUpperCase()}</h1>
              <div class="subtitle">Official Treasury Audit & Financial Operations Statement</div>
            </div>
            <div style="text-align: right;">
              <span class="badge">${periodFilter.toUpperCase()} REPORT</span>
              <div class="subtitle" style="margin-top: 8px;">Generated: ${new Date().toLocaleString()}</div>
            </div>
          </div>

          <h2 style="font-size: 16px; margin-bottom: 15px;">${periodLabel}</h2>

          <div class="summary-cards">
            <div class="card">
              <div class="card-label">Total Revenue (Income)</div>
              <div class="card-val val-income">SLE ${totalIncome.toLocaleString()}</div>
            </div>
            <div class="card">
              <div class="card-label">Total Expenditures (Expenses)</div>
              <div class="card-val val-expense">SLE ${totalExpenses.toLocaleString()}</div>
            </div>
            <div class="card">
              <div class="card-label">Net Operating Position</div>
              <div class="card-val val-net">SLE ${netBalance.toLocaleString()}</div>
            </div>
          </div>

          <h3 style="font-size: 14px; margin-bottom: 10px;">Itemized Treasury Transactions Ledger (${filteredRecords.length} Entries)</h3>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Contributor / Beneficiary</th>
                <th>Category</th>
                <th>Method</th>
                <th style="text-align: right;">Amount (SLE)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRecords.map(r => `
                <tr>
                  <td>${new Date(r.date).toLocaleDateString()}</td>
                  <td><span class="${r.type === 'expense' ? 'type-expense' : 'type-income'}">${r.type || 'income'}</span></td>
                  <td><strong>${r.contributor_name}</strong></td>
                  <td>${r.category}</td>
                  <td style="text-transform: capitalize;">${r.payment_method.replace('_', ' ')}</td>
                  <td style="text-align: right; font-weight: 800; color: ${r.type === 'expense' ? '#e11d48' : '#059669'}">
                    ${r.type === 'expense' ? '-' : '+'}${Number(r.amount).toLocaleString()}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="sign-block">
            <div>
              <div class="sign-line"></div>
              <div class="sign-title">Prepared By: Finance Officer / Treasury</div>
              <div style="font-size: 11px; color: #64748b;">${profile ? `${profile.first_name} ${profile.last_name}` : 'Church Financial Officer'}</div>
            </div>
            <div>
              <div class="sign-line"></div>
              <div class="sign-title">Approved By: Senior Pastor / Church Board</div>
              <div style="font-size: 11px; color: #64748b;">${cp.name} Leadership</div>
            </div>
          </div>

          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      {/* Finance Officer Notification Alert for Pending Ministry Proposals */}
      {pendingReqsCount > 0 && (
        <div className="p-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-900 text-white rounded-3xl shadow-lg border border-indigo-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <Bell size={20} className="animate-bounce" />
            </div>
            <div>
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950">
                Action Required ({pendingReqsCount} Pending Proposals)
              </span>
              <h4 className="text-sm font-black mt-1">Ministry Funding Proposal Awaiting Review</h4>
              <p className="text-xs text-indigo-200 mt-0.5">
                Ministry Leaders have submitted funding requests for equipment & department operations.
              </p>
            </div>
          </div>

          <button
            onClick={() => setWorkspaceTab('requisitions')}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs shadow-md transition-all shrink-0 cursor-pointer"
          >
            Review Proposals & Issue Invoices &rarr;
          </button>
        </div>
      )}

      {/* Treasury Header */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 flex items-center gap-1">
                <ShieldCheck size={12} className="text-amber-700" />
                Finance Officer Console
              </span>
              <span className="text-xs text-slate-400 font-semibold">• Currency: SLE</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Church Financial Operations</h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Review ministry proposals, generate expense invoices, upload vendor payment receipts & link transactions directly to the financial ledger.
            </p>
          </div>

          {/* Quick Action Buttons - Touch friendly 2-col on mobile, flex on desktop */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              onClick={() => setShowIncomeModal(true)}
              className="px-3.5 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all min-h-[44px]"
            >
              <Plus size={16} />
              <span>Record Income</span>
            </button>

            <button
              onClick={() => setShowExpenseModal(true)}
              className="px-3.5 sm:px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all min-h-[44px]"
            >
              <Plus size={16} />
              <span>Record Expense</span>
            </button>

            <button
              onClick={downloadFullFinancialPDF}
              className="col-span-2 sm:col-span-1 px-3.5 sm:px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all min-h-[44px]"
            >
              <Printer size={16} />
              <span>Export PDF Audit</span>
            </button>
          </div>
        </div>

        {/* Workspace Sub Navigation Tabs - Desktop view (hidden lg:flex) */}
        <div className="hidden lg:flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 pb-1 -mx-1 px-1">
          <button
            onClick={() => setWorkspaceTab('ledger')}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[40px] ${
              workspaceTab === 'ledger'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <PieChart size={15} />
            <span>Financial Ledger</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200">
              {filteredRecords.length}
            </span>
          </button>

          <button
            onClick={() => setWorkspaceTab('requisitions')}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[40px] relative ${
              workspaceTab === 'requisitions'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingCart size={15} />
            <span>Ministry Proposals</span>
            {pendingReqsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 animate-pulse">
                {pendingReqsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setWorkspaceTab('event_budgets')}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[40px] relative ${
              workspaceTab === 'event_budgets'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar size={15} />
            <span>Event Budgets</span>
            {eventBudgets.filter(b => b.status === 'pending_approval').length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 animate-pulse">
                {eventBudgets.filter(b => b.status === 'pending_approval').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setWorkspaceTab('gateways')}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[40px] ${
              workspaceTab === 'gateways'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders size={15} />
            <span>Gateways & Funds</span>
          </button>
        </div>
      </div>

      {/* --- WORKSPACE TAB 1: FINANCIAL LEDGER & REPORTS --- */}
      {workspaceTab === 'ledger' && (
        <div className="space-y-6">
          {/* Summary Metrics Bar - 2 columns per row on mobile and tablet */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
                <span className="truncate">TOTAL REVENUE</span>
                <ArrowUpRight size={18} className="text-emerald-500 shrink-0" />
              </div>
              <div className="text-lg sm:text-2xl font-black text-emerald-600 font-mono tabular-nums truncate">
                SLE {totalIncome.toLocaleString()}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Tithes, offerings & pledges</p>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
                <span className="truncate">EXPENDITURES</span>
                <ArrowDownRight size={18} className="text-rose-500 shrink-0" />
              </div>
              <div className="text-lg sm:text-2xl font-black text-rose-600 font-mono tabular-nums truncate">
                SLE {totalExpenses.toLocaleString()}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Stipends, invoices & power</p>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
                <span className="truncate">NET POSITION</span>
                <DollarSign size={18} className="text-indigo-500 shrink-0" />
              </div>
              <div className={`text-lg sm:text-2xl font-black font-mono tabular-nums truncate ${netBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                SLE {netBalance.toLocaleString()}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Net operating balance</p>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
                <span className="truncate">PENDING AUDIT</span>
                <Clock size={18} className="text-amber-500 shrink-0" />
              </div>
              <div className="text-lg sm:text-2xl font-black text-amber-600 font-mono tabular-nums truncate">
                {pendingCount} Txns
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">SLE {pendingAmount.toLocaleString()}</p>
            </div>
          </div>

          {/* Ministry & Department Spending Breakdown Pie Chart Section */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                    Treasury Financial Analytics
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    • Total Expenditure: SLE {totalExpenses.toLocaleString()}
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 mt-1 flex items-center gap-2">
                  Ministry & Department Spending Breakdown
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visual distribution of operational expenses, event allocations, and ministry department requisitions across the cathedral lifecycle.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="px-3 py-1 bg-slate-100 text-slate-700 font-extrabold rounded-xl text-xs">
                  {departmentSpendingData.length} Active Categories
                </span>
              </div>
            </div>

            {departmentSpendingData.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-2">
                {/* Recharts Pie Chart Container */}
                <div className="lg:col-span-5 h-[280px] w-full flex items-center justify-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={departmentSpendingData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={105}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {departmentSpendingData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(val: any) => [`SLE ${Number(val).toLocaleString()}`, 'Amount']}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          color: '#ffffff',
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          padding: '10px 14px'
                        }}
                        itemStyle={{ color: '#38bdf8' }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>

                  {/* Center Stat inside Doughnut Hole */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Disbursed</span>
                    <span className="text-sm font-black text-slate-900 font-mono mt-0.5">
                      SLE {totalExpenses > 1000 ? `${(totalExpenses / 1000).toFixed(1)}k` : totalExpenses}
                    </span>
                  </div>
                </div>

                {/* Department Legend & Percentage Share */}
                <div className="lg:col-span-7 space-y-2.5 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
                  {departmentSpendingData.map((dept, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/80 transition-all">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span
                            className="w-3.5 h-3.5 rounded-md shrink-0 shadow-2xs"
                            style={{ backgroundColor: dept.color }}
                          />
                          <span className="font-extrabold text-slate-800 truncate">{dept.name}</span>
                        </div>

                        <div className="text-right shrink-0">
                          <strong className="font-black text-slate-900 font-mono text-xs">
                            SLE {dept.value.toLocaleString()}
                          </strong>
                          <span className="ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-800">
                            {dept.percentage}%
                          </span>
                        </div>
                      </div>

                      {/* Visual Spending Bar */}
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${dept.percentage}%`, backgroundColor: dept.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/60 text-slate-400 space-y-2">
                <PieChart size={32} className="mx-auto text-slate-300" />
                <p className="text-xs font-semibold">No expense records or disbursed requisitions logged for this selected timeframe.</p>
                <p className="text-[11px]">Record an expenditure entry above or disburse a ministry proposal to generate pie chart breakdown analytics.</p>
              </div>
            )}
          </div>

          {/* Filter Controls - Period Dropdown with Download CSV button on the right */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-xs sm:max-w-sm">
                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider shrink-0">Period:</label>
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">All-Time</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="quarter">This Quarter</option>
                  <option value="year">This Year</option>
                </select>
              </div>

              <button
                onClick={downloadCSVReport}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs min-h-[38px]"
              >
                <Download size={14} />
                <span className="hidden sm:inline">Download CSV Ledger</span>
                <span className="sm:hidden">CSV Ledger</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search contributor, payee, txn ref..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as any)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">Type: Revenue & Expenses</option>
                <option value="income">Type: Revenue (Income)</option>
                <option value="expense">Type: Expenditures (Expenses)</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">Status: All Statuses</option>
                <option value="pending_verification">Pending Verification</option>
                <option value="completed">Completed / Verified</option>
                <option value="rejected">Rejected / Flagged</option>
              </select>

              <select
                value={selectedCategoryFilter}
                onChange={e => setSelectedCategoryFilter(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">Category: All Categories</option>
                <option value="Tithe">Tithe</option>
                <option value="Sunday Offering">Sunday Offering</option>
                <option value="Building & Sanctuary Expansion">Building Fund</option>
                <option value="Pastoral & Staff Stipends">Pastoral Stipends</option>
                <option value="Utilities & Electricity">Utilities & Power</option>
                <option value="Ministry & Worship Budgets">Ministry Budgets</option>
                <option value="Media & IT Equipment">Media & IT Equipment</option>
              </select>
            </div>
          </div>

          {/* Records View: Mobile/Tablet Cards + Desktop Table */}
          <div className="space-y-3">
            {/* MOBILE & TABLET CARD VIEW (block lg:hidden) */}
            <div className="block lg:hidden space-y-3">
              {loading ? (
                <div className="p-8 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">
                  Loading financial records...
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">
                  No transactions match the selected filters.
                </div>
              ) : (
                filteredRecords.map(r => {
                  const isExpense = r.type === 'expense';
                  return (
                    <div key={r.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3 hover:border-slate-300 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-sm leading-snug">{r.contributor_name}</h4>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{new Date(r.date).toLocaleString()}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-black text-base font-mono tabular-nums ${isExpense ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {isExpense ? '-' : '+'}{r.currency || 'SLE'} {Number(r.amount).toLocaleString()}
                          </div>
                          <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            r.status === 'completed' || !r.status ? 'bg-emerald-100 text-emerald-800' :
                            r.status === 'pending_verification' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {r.status === 'pending_verification' ? 'Pending Audit' : r.status || 'Verified'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          isExpense ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isExpense ? 'Expense' : 'Revenue'}
                        </span>
                        <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">{r.category}</span>
                        <span className="text-slate-500 font-medium capitalize text-[11px]">• {r.payment_method.replace('_', ' ')}</span>
                      </div>

                      {r.notes && (
                        <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100 italic">
                          "{r.notes}"
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          {r.transaction_id && <span>Ref: <strong className="text-indigo-600">{r.transaction_id}</strong></span>}
                          {r.payment_proof_ref && <span className="ml-2 text-emerald-600 font-semibold">• Proof Attached</span>}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {r.status === 'pending_verification' && (
                            <>
                              <button
                                onClick={() => handleApproveRecord(r.id)}
                                title="Verify & Confirm"
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 min-h-[38px]"
                              >
                                <Check size={14} /> Verify
                              </button>
                              <button
                                onClick={() => handleRejectRecord(r.id)}
                                title="Flag / Reject"
                                className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 min-h-[38px]"
                              >
                                <X size={14} /> Reject
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => setShowPrintModal(r)}
                            title="Print Official Receipt/Voucher"
                            className="p-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl min-h-[38px] flex items-center justify-center cursor-pointer"
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* DESKTOP LARGE TABLE VIEW (hidden lg:block) */}
            <div className="hidden lg:block bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-5 py-3.5">Contributor / Payee</th>
                      <th className="px-5 py-3.5">Type & Category</th>
                      <th className="px-5 py-3.5">Payment Method & Vendor Ref</th>
                      <th className="px-5 py-3.5 text-right">Amount (SLE)</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                          Loading financial records...
                        </td>
                      </tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                          No transactions match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map(r => {
                        const isExpense = r.type === 'expense';
                        return (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="font-extrabold text-slate-900 text-sm">
                                {r.contributor_name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {new Date(r.date).toLocaleString()}
                              </div>
                            </td>

                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                  isExpense ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {isExpense ? 'Expense' : 'Revenue'}
                                </span>
                                <span className="font-bold text-slate-700">{r.category}</span>
                              </div>
                              {r.notes && <p className="text-[10px] text-slate-400 truncate max-w-xs mt-0.5">{r.notes}</p>}
                            </td>

                            <td className="px-5 py-3.5">
                              <div className="font-bold text-slate-800 capitalize">
                                {r.payment_method.replace('_', ' ')}
                              </div>
                              {r.transaction_id && (
                                <div className="font-mono text-[10px] text-indigo-600">
                                  Ref: {r.transaction_id}
                                </div>
                              )}
                              {r.payment_proof_ref && (
                                <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                                  <FileText size={10} /> Proof: {r.payment_proof_ref}
                                </div>
                              )}
                            </td>

                            <td className={`px-5 py-3.5 text-right font-black text-sm tabular-nums ${
                              isExpense ? 'text-rose-600' : 'text-emerald-600'
                            }`}>
                              {isExpense ? '-' : '+'}{r.currency || 'SLE'} {Number(r.amount).toLocaleString()}
                            </td>

                            <td className="px-5 py-3.5">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                r.status === 'completed' || !r.status ? 'bg-emerald-100 text-emerald-800' :
                                r.status === 'pending_verification' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                                'bg-rose-100 text-rose-800'
                              }`}>
                                {r.status === 'pending_verification' ? 'Pending Audit' : r.status || 'Verified'}
                              </span>
                            </td>

                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {r.status === 'pending_verification' && (
                                  <>
                                    <button
                                      onClick={() => handleApproveRecord(r.id)}
                                      title="Verify & Confirm"
                                      className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Check size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleRejectRecord(r.id)}
                                      title="Flag / Reject"
                                      className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <X size={16} />
                                    </button>
                                  </>
                                )}

                                <button
                                  onClick={() => setShowPrintModal(r)}
                                  title="Print Official Receipt/Voucher"
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Printer size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- WORKSPACE TAB 2: MINISTRY PROPOSALS & EXPENSE INVOICES --- */}
      {workspaceTab === 'requisitions' && (
        <div className="space-y-6">
          {/* Requisitions Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-amber-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-amber-700 tracking-wider block">Awaiting Pastor Approval</span>
              <div className="text-2xl font-black text-amber-600">
                {requisitions.filter(r => r.status === 'pending_pastor_approval' || r.status === 'pending_approval').length} Proposals
              </div>
              <p className="text-[11px] text-slate-400">Step 1: Senior Pastor review</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-purple-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-purple-700 tracking-wider block">Pastor Approved (Disburse Queue)</span>
              <div className="text-2xl font-black text-purple-700">
                {requisitions.filter(r => r.status === 'pastor_approved' || r.status === 'approved').length} Ready to Disburse
              </div>
              <p className="text-[11px] text-slate-400">Step 2: FO invoice & payment</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-indigo-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-indigo-700 tracking-wider block">Disbursed (Receipt Audit)</span>
              <div className="text-2xl font-black text-indigo-600">
                {requisitions.filter(r => r.status === 'disbursed' || r.status === 'reconciled').length} Active Requisitions
              </div>
              <p className="text-[11px] text-slate-400">Step 3 & 4: Expenditure report</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider block">Settled in Good Standing</span>
              <div className="text-2xl font-black text-emerald-600">
                {requisitions.filter(r => r.status === 'settled').length} Closed Requisitions
              </div>
              <p className="text-[11px] text-slate-400">100% receipt verified</p>
            </div>
          </div>

          {/* Requisitions List */}
          <div className="space-y-4">
            {requisitions.map(req => {
              const isUrgent = req.priority === 'urgent' || req.priority === 'high';
              const standing = getDepartmentFinancialStanding(req.department_name, requisitions);

              return (
                <div key={req.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {req.requisition_number}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700">
                          {req.department_name}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isUrgent ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          Priority: {req.priority}
                        </span>

                        {/* Department Financial Standing Compliance Badge */}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${standing.badge_color}`}>
                          <ShieldCheck size={12} />
                          Department Standing: {standing.standing_status} ({standing.reconciliation_compliance_rate}%)
                        </span>
                      </div>

                      <h3 className="text-xl font-black text-slate-900">{req.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">{req.description}</p>
                    </div>

                    <div className="text-left md:text-right shrink-0">
                      <div className="text-xs text-slate-400 font-bold uppercase">Requested Funding</div>
                      <div className="text-2xl font-black text-indigo-700">
                        {req.currency || 'SLE'} {req.requested_amount.toLocaleString()}
                      </div>
                      <span className={`inline-block mt-1 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        req.status === 'pending_pastor_approval' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                        req.status === 'pastor_approved' ? 'bg-purple-600 text-white font-black shadow-xs' :
                        req.status === 'pending_approval' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                        req.status === 'submitted_to_board' ? 'bg-purple-100 text-purple-800 animate-bounce' :
                        req.status === 'approved' ? 'bg-indigo-100 text-indigo-800 font-bold' :
                        req.status === 'disbursed' ? 'bg-emerald-100 text-emerald-800 font-bold' :
                        req.status === 'reconciled' ? 'bg-teal-100 text-teal-800 font-bold' :
                        req.status === 'settled' ? 'bg-emerald-800 text-white font-bold' :
                        'bg-rose-100 text-rose-800'
                      }`}>
                        {req.status === 'pending_pastor_approval' ? 'Step 1: Awaiting Senior Pastor Approval' :
                         req.status === 'pastor_approved' ? 'Step 2: Approved by Senior Pastor — Disburse Now' :
                         req.status === 'pending_approval' ? 'Under Finance Triage' : 
                         req.status === 'submitted_to_board' ? 'Escalated to Senior Pastor & Board' :
                         req.status === 'approved' ? 'Authorized by Pastor & Board — Disburse Now' :
                         req.status === 'disbursed' ? 'Disbursed (Awaiting Receipts)' :
                         req.status === 'reconciled' ? 'Receipts Submitted (Awaiting Settlement)' :
                         req.status === 'settled' ? 'Audited & Settled in Good Standing' :
                         req.status}
                      </span>
                    </div>
                  </div>

                  {/* Stage Notes & Pastor Approvals */}
                  {req.pastor_approval_notes && (
                    <div className="p-3.5 bg-purple-50 rounded-2xl border border-purple-200 text-xs text-purple-950 font-medium flex items-start gap-2">
                      <CheckCircle2 size={16} className="text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Senior Pastor Approval Sign-off:</strong> {req.pastor_approval_notes}
                        <span className="text-[10px] text-purple-700 font-semibold block mt-0.5">Approved By: {req.pastor_approved_by || 'Senior Pastor'} ({req.pastor_approved_at ? new Date(req.pastor_approved_at).toLocaleString() : 'Approved'})</span>
                      </div>
                    </div>
                  )}

                  {req.finance_officer_review_notes && (
                    <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 text-xs text-amber-900">
                      <strong>Finance Officer Triage Note:</strong> {req.finance_officer_review_notes}
                    </div>
                  )}

                  {req.board_notes && !req.pastor_approval_notes && (
                    <div className="p-3 bg-purple-50/80 rounded-2xl border border-purple-200 text-xs text-purple-900">
                      <strong>Board & Senior Pastor Authorization:</strong> {req.board_notes} ({req.board_approved_by})
                    </div>
                  )}

                  {/* Items Preview Table */}
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/60 text-xs">
                    <div className="font-extrabold text-slate-700 mb-2 flex items-center justify-between">
                      <span>Itemized Equipment & Budget Breakdown ({req.items.length} Items):</span>
                      <span className="text-slate-400 text-[11px]">Submitted By: {req.applicant_name} ({req.applicant_role || 'Ministry Lead'})</span>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {req.items.map(item => (
                        <div key={item.id} className="py-1.5 flex justify-between items-center text-slate-800">
                          <span>{item.item_name} <strong className="text-slate-400 font-normal">x{item.quantity}</strong></span>
                          <strong className="font-mono text-slate-900">SLE {item.total_price.toLocaleString()}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Receipt Upload & Post-Disbursement Spending Audit View (Stages 5 & 6) */}
                  {(req.status === 'reconciled' || req.status === 'settled') && (
                    <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-2xl text-xs space-y-2">
                      <div className="flex items-center justify-between text-teal-950 font-black">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 size={16} className="text-teal-600" />
                          Department Expenditure Report & Receipt Verification
                        </span>
                        <span className="font-mono text-[11px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-md">
                          Spent: SLE {(req.actual_amount_spent || req.requested_amount).toLocaleString()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-700 pt-1">
                        <div>
                          <span className="text-slate-500 font-medium">Vendor Tax Receipt Proof:</span>
                          <p className="font-bold text-indigo-700 font-mono text-[11px] truncate">
                            {req.receipt_proof_url || 'Vendor_Tax_Receipt_Signed.pdf'}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Unspent Balance Returned:</span>
                          <p className="font-bold text-emerald-700 font-mono">
                            SLE {(req.unspent_balance_returned || 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Audit Compliance Rating:</span>
                          <p className="font-bold text-emerald-800">
                            100% On-Time Receipt Verification
                          </p>
                        </div>
                      </div>

                      {req.receipt_notes && (
                        <p className="text-slate-600 italic bg-white p-2.5 rounded-xl border border-teal-100 mt-1">
                          "{req.receipt_notes}"
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-slate-500 font-medium">
                      {req.disbursement_method && (
                        <span>Channel: <strong className="text-slate-800 uppercase">{req.disbursement_method.replace('_', ' ')}</strong></span>
                      )}
                      {req.disbursement_account_info && (
                        <span className="ml-3 text-slate-700 font-mono">• {req.disbursement_account_info}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {(req.status === 'pending_approval' || req.status === 'pending_pastor_approval') && (
                        <>
                          <button
                            onClick={() => handleApproveRequisition(req.id)}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                          >
                            Approve Proposal
                          </button>

                          <button
                            onClick={() => handleEscalateToBoard(req.id)}
                            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Send size={13} /> Escalate to Board
                          </button>

                          <button
                            onClick={() => handleRejectRequisition(req.id)}
                            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {req.status === 'reconciled' && (
                        <button
                          onClick={() => handleSettleRequisition(req.id)}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-xl text-xs shadow-md shadow-emerald-100 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <ShieldCheck size={16} /> Audit & Settle in Good Standing
                        </button>
                      )}

                      {(req.status === 'pastor_approved' || req.status === 'approved' || req.status === 'pending_approval') && (
                        <button
                          onClick={() => openDisbursementModal(req)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md shadow-emerald-100 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <FileCode size={15} /> Generate Expense Invoice & Disburse
                        </button>
                      )}

                      <button
                        onClick={() => handlePrintRequisitionVoucher(req)}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer size={14} /> Print Voucher / Invoice
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- WORKSPACE TAB 3: MOBILE MONEY & PAYMENT SETUP --- */}
      {workspaceTab === 'gateways' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <Smartphone className="text-amber-600" size={22} />
                  Custom Mobile Money Gateways
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure USSD instructions, merchant codes, and account numbers for Afrimoney, Orange Money, QMoney, etc.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddGateway}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto"
              >
                <Plus size={16} /> Add Custom Mobile Money Provider
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {givingConfig.mobile_gateways.map((g, idx) => (
                <div key={g.id || idx} className={`p-5 rounded-2xl border transition-all ${
                  g.is_active ? 'bg-amber-50/30 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-60'
                }`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500 text-white font-black flex items-center justify-center text-sm shadow-xs">
                        {g.provider.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 text-base">{g.provider}</h4>
                        <span className="text-xs font-bold text-slate-500">{g.merchant_name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleGateway(g.id || g.provider)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                          g.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {g.is_active ? 'Active' : 'Disabled'}
                      </button>
                      <button
                        onClick={() => handleOpenEditGateway(g)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteGateway(g.id || g.provider)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-700 bg-white p-3 rounded-xl border border-slate-100">
                    <p className="flex justify-between">
                      <span className="text-slate-400 font-medium">Merchant Code / Number:</span>
                      <strong className="font-mono text-slate-900">{g.merchant_number}</strong>
                    </p>
                    <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                      <strong>USSD Instructions:</strong> {g.dial_code_instructions}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- WORKSPACE TAB 3: EVENT BUDGET APPROVALS --- */}
      {workspaceTab === 'event_budgets' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-xl font-black text-slate-900">Event Budget Proposals & Treasury Governance</h3>
                <p className="text-xs text-slate-500">
                  Automated budget authorization flow. Event Managers submit itemized budgets for Finance Officer approval prior to disbursement.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-xl text-xs font-black">
                  {eventBudgets.filter(b => b.status === 'pending_approval').length} Pending Approval
                </span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-900 rounded-xl text-xs font-black">
                  {eventBudgets.filter(b => b.status === 'approved').length} Approved
                </span>
              </div>
            </div>

            {/* Success Banner */}
            {evtDisburseSuccessMsg && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-xs font-bold animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                  <span>{evtDisburseSuccessMsg}</span>
                </div>
                <button onClick={() => setEvtDisburseSuccessMsg(null)} className="p-1 hover:bg-emerald-100 rounded text-emerald-600">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* RESPONSIVE MOBILE & TABLET SIDE-BY-SIDE / STACKED GRID CARD VIEW (xl:hidden) */}
            <div className="block xl:hidden space-y-4">
              {eventBudgets.map(b => (
                <div key={b.event_id} className="p-4 sm:p-5 bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                    
                    {/* Left/Main Column: Invoice Header & Itemized Proforma Breakdown */}
                    <div className="md:col-span-7 lg:col-span-8 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-900 font-mono font-black text-xs rounded-lg border border-indigo-200">
                            {b.invoice_number || 'INV-EVT-2026'}
                          </span>
                          <span className="text-[11px] font-bold text-slate-400">• {new Date(b.submitted_at).toLocaleDateString()}</span>
                        </div>

                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          b.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          b.status === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                          'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                        }`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-black text-slate-900 text-base leading-snug">{b.event_title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Manager / Submitted By: <strong className="text-slate-800 font-bold">{b.submitted_by}</strong></p>
                      </div>

                      {/* Line Items Itemized Proforma Table / Grid */}
                      {b.items_breakdown && b.items_breakdown.length > 0 && (
                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-200 pb-1.5">
                            <span>Item Description & Qty</span>
                            <span>Total (SLE)</span>
                          </div>
                          {b.items_breakdown.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 last:border-none">
                              <div className="min-w-0 flex-1 pr-2">
                                <span className="font-extrabold text-slate-800 block truncate">{item.description}</span>
                                <span className="text-[10px] text-slate-400 font-medium">Qty: {item.quantity} × SLE {(item.unit_price || 0).toLocaleString()}</span>
                              </div>
                              <strong className="font-mono text-slate-900 text-xs shrink-0 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                SLE {(item.total_price || 0).toLocaleString()}
                              </strong>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs">
                        <span className="font-extrabold text-emerald-950 uppercase tracking-wider text-[10px]">Total Event Budget Requested:</span>
                        <strong className="text-base font-black text-emerald-700 font-mono">SLE {(b.total_budget || 0).toLocaleString()}</strong>
                      </div>

                      {b.rejection_reason && (
                        <p className="text-xs text-rose-700 font-bold bg-rose-50 p-2.5 rounded-xl border border-rose-200">Rejection Reason: {b.rejection_reason}</p>
                      )}
                    </div>

                    {/* Right/Side Column: Touch-friendly Action Buttons */}
                    <div className="md:col-span-5 lg:col-span-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 flex flex-col justify-between h-full">
                      <div className="space-y-1">
                        <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">Finance Actions</span>
                        <p className="text-[11px] text-slate-500 font-medium">Review proforma items, authorize funding, or disburse directly into event treasury.</p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handlePrintEventBudgetInvoice(b)}
                            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer min-h-[42px]"
                          >
                            <Printer size={15} /> Print PDF
                          </button>

                          {(b.status === 'approved' || b.status === 'pending_approval') && (
                            <button
                              onClick={() => openEventBudgetDisbursementModal(b)}
                              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md shadow-emerald-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[42px]"
                            >
                              <FileCode size={16} /> Disburse
                            </button>
                          )}
                        </div>

                        {b.status === 'pending_approval' && (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                const note = prompt("Enter approval note or budget authorization code (optional):", "Budget authorized by Finance Officer.");
                                approveEventBudget(b.event_id, profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer', note || undefined);
                              }}
                              className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer min-h-[42px] shadow-2xs"
                            >
                              <CheckCircle size={15} /> Approve
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt("Enter reason for rejecting or requesting budget revision:");
                                if (reason) rejectEventBudget(b.event_id, profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer', reason);
                              }}
                              className="py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer min-h-[42px]"
                            >
                              <X size={15} /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              ))}

              {eventBudgets.length === 0 && (
                <p className="p-8 text-center text-slate-400 italic text-xs bg-white rounded-3xl border border-slate-200">No event budgets submitted for review yet.</p>
              )}
            </div>

            {/* DESKTOP LARGE TABLE VIEW (hidden xl:block) */}
            <div className="hidden xl:block overflow-x-auto bg-white rounded-3xl border border-slate-200 shadow-xs">
              <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px]">
                    <th className="p-3.5">Invoice #</th>
                    <th className="p-3.5">Church Event Title</th>
                    <th className="p-3.5">Submitted By</th>
                    <th className="p-3.5 text-right">Total Budget</th>
                    <th className="p-3.5">Submission Date</th>
                    <th className="p-3.5">Approval Status</th>
                    <th className="p-3.5 text-right">Finance Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {eventBudgets.map(b => (
                    <tr key={b.event_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-indigo-700">
                        {b.invoice_number || 'INV-EVT-2026'}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">
                        {b.event_title}
                        {b.notes && <p className="text-[10px] text-slate-400 font-normal mt-0.5">{b.notes}</p>}
                        {b.rejection_reason && <p className="text-[10px] text-rose-600 font-bold mt-0.5">Reason: {b.rejection_reason}</p>}
                      </td>
                      <td className="p-3.5 text-slate-600 font-semibold">{b.submitted_by}</td>
                      <td className="p-3.5 text-right font-black text-slate-900 font-mono">{b.total_budget?.toLocaleString()} SLE</td>
                      <td className="p-3.5 text-slate-500">{new Date(b.submitted_at).toLocaleDateString()}</td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          b.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          b.status === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                          'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                        }`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          <button
                            onClick={() => handlePrintEventBudgetInvoice(b)}
                            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
                            title="Print / Download Proforma Invoice PDF"
                          >
                            <Printer size={13} /> Print Invoice
                          </button>

                          {(b.status === 'approved' || b.status === 'pending_approval') && (
                            <button
                              onClick={() => openEventBudgetDisbursementModal(b)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-xs shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              <FileCode size={13} /> Disburse Event Funds
                            </button>
                          )}

                          {b.status === 'pending_approval' && (
                            <>
                              <button
                                onClick={() => {
                                  const note = prompt("Enter approval note or budget authorization code (optional):", "Budget authorized by Finance Officer.");
                                  approveEventBudget(b.event_id, profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer', note || undefined);
                                }}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold rounded-lg text-xs transition-colors cursor-pointer shrink-0"
                              >
                                <CheckCircle size={13} /> Approve
                              </button>
                              <button
                                onClick={() => {
                                  const reason = prompt("Enter reason for rejecting or requesting budget revision:");
                                  if (reason) rejectEventBudget(b.event_id, profile ? `${profile.first_name} ${profile.last_name}` : 'Finance Officer', reason);
                                }}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold cursor-pointer shrink-0"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {eventBudgets.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 italic">No event budgets submitted for review yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- INVOICING & DISBURSEMENT MODAL --- */}
      {disburseReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  Church Expense Invoicing System
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">Generate Invoice & Disburse Request</h3>
              </div>
              <button onClick={() => setDisburseReq(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Proposal ID:</span>
                <strong className="text-indigo-600">{disburseReq.requisition_number}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Department & Lead:</span>
                <strong className="text-slate-800">{disburseReq.department_name} ({disburseReq.applicant_name})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Proposal Purpose:</span>
                <span className="font-bold text-slate-900">{disburseReq.title}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-400">Approved Amount:</span>
                <strong className="text-base text-emerald-600 font-black">
                  {disburseReq.currency || 'SLE'} {disburseReq.requested_amount.toLocaleString()}
                </strong>
              </div>
            </div>

            <form onSubmit={handleConfirmInvoiceAndDisbursement} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Generated Invoice No. *</label>
                  <input
                    type="text"
                    required
                    value={disbursementInvoiceNo}
                    onChange={e => setDisbursementInvoiceNo(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-indigo-700"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Bank Wire / Payment Txn Ref *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SLCB-TRANSFER-9921"
                    value={disbursementTxnRef}
                    onChange={e => setDisbursementTxnRef(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Vendor Payment Receipt / Invoice Upload</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Attachment reference e.g. Vendor_Tax_Invoice_Signed.pdf"
                    value={vendorReceiptUrl}
                    onChange={e => setVendorReceiptUrl(e.target.value)}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setVendorReceiptUrl(`Vendor_Tax_Receipt_${Date.now().toString().slice(-4)}.pdf`)}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Upload size={14} /> Attach Receipt
                  </button>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-950 font-medium">
                <strong>Financial Ledger Link:</strong> Processing this invoice will change proposal status to <strong>Disbursed</strong> and automatically record an Expense entry in the Treasury Financial Ledger.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setDisburseReq(null)} className="px-4 py-2 text-slate-500 font-bold">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2.5 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 shadow-md">
                  Process Invoice & Post Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EVENT BUDGET DISBURSEMENT MODAL */}
      {disburseEventBudget && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  Event Budget Disbursement Engine
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">Disburse Event Funds & Post Expense</h3>
              </div>
              <button onClick={() => setDisburseEventBudget(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Proforma Invoice #:</span>
                <strong className="text-indigo-600 font-mono font-bold">{disburseEventBudget.invoice_number || 'INV-EVT-2026'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Event Title & Manager:</span>
                <strong className="text-slate-900">{disburseEventBudget.event_title} ({disburseEventBudget.submitted_by})</strong>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-400">Total Approved Budget:</span>
                <strong className="text-base text-emerald-600 font-black font-mono">
                  SLE {(disburseEventBudget.total_budget || 0).toLocaleString()}
                </strong>
              </div>
            </div>

            <form onSubmit={handleConfirmEventBudgetDisbursement} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Disbursement Channel *</label>
                  <select
                    value={evtDisburseChannel}
                    onChange={e => setEvtDisburseChannel(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                  >
                    <option value="mobile_money">Mobile Money (Afrimoney / Orange Money)</option>
                    <option value="bank_transfer">Bank Wire / ACH Transfer</option>
                    <option value="cash">Cash Voucher</option>
                  </select>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Payment Txn Reference *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DISB-EVT-9921"
                    value={evtDisburseTxnRef}
                    onChange={e => setEvtDisburseTxnRef(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Payment Account Info / Recipient Phone</label>
                <input
                  type="text"
                  placeholder="e.g. Afrimoney 076 112233 - Event Committee Account"
                  value={evtDisburseAccountInfo}
                  onChange={e => setEvtDisburseAccountInfo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Vendor Receipt / Bank Proof File Ref</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={evtDisburseProofUrl}
                    onChange={e => setEvtDisburseProofUrl(e.target.value)}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setEvtDisburseProofUrl(`Signed_Bank_Voucher_${Date.now().toString().slice(-4)}.pdf`)}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Upload size={14} /> Attach Proof
                  </button>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-950 font-medium">
                <strong>Treasury Ledger Sync:</strong> Disbursing this event budget will change the approval status to <strong>Approved & Disbursed</strong> and record an expense entry in the Treasury Financial Ledger.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setDisburseEventBudget(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 shadow-md flex items-center gap-1.5 cursor-pointer">
                  <FileCode size={15} /> Confirm & Disburse Funds
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INCOME MODAL */}
      {showIncomeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  Treasury Intake
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">Record Church Revenue</h3>
              </div>
              <button onClick={() => setShowIncomeModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveIncome} className="space-y-3.5 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-extrabold text-slate-700 block text-xs">Contributor / Member Name *</label>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setIncomeContributorType('member');
                        if (membersList.length > 0 && !selectedIncomeMemberId) {
                          handleSelectIncomeMember(membersList[0].id);
                        }
                      }}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        incomeContributorType === 'member' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Select Member
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIncomeContributorType('non_member');
                        setSelectedIncomeMemberId('custom');
                      }}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        incomeContributorType === 'non_member' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Non-Member
                    </button>
                  </div>
                </div>

                {incomeContributorType === 'member' ? (
                  <div className="space-y-1.5">
                    <select
                      value={selectedIncomeMemberId}
                      onChange={e => handleSelectIncomeMember(e.target.value)}
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
                        <span>Selected Member: <strong>{contributor}</strong></span>
                        <button type="button" onClick={() => setIncomeContributorType('non_member')} className="text-indigo-600 hover:underline text-[10px] cursor-pointer">
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
                  <label className="font-extrabold text-slate-700 block mb-1">Giving Fund *</label>
                  <select
                    value={selectedFundId}
                    onChange={e => setSelectedFundId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                  >
                    {givingConfig.funds.filter(f => f.is_active).map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                    <option value="custom_fund">+ Custom Fund</option>
                  </select>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Amount ({givingConfig.currency_symbol || 'SLE'}) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="500.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-emerald-600 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowIncomeModal(false)} className="px-4 py-2 text-slate-500 font-bold">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 shadow-md">
                  Save Intake Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800">
                  Treasury Disbursement
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">Record Church Expenditure</h3>
              </div>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3.5 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-extrabold text-slate-700 block text-xs">Payee / Beneficiary Name *</label>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setExpensePayeeType('non_member');
                        setSelectedExpenseMemberId('custom');
                      }}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        expensePayeeType === 'non_member' ? 'bg-white text-rose-700 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Vendor / Non-Member
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExpensePayeeType('member');
                        if (membersList.length > 0 && !selectedExpenseMemberId) {
                          handleSelectExpensePayee(membersList[0].id);
                        }
                      }}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        expensePayeeType === 'member' ? 'bg-white text-rose-700 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Select Member / Staff
                    </button>
                  </div>
                </div>

                {expensePayeeType === 'member' ? (
                  <div className="space-y-1.5">
                    <select
                      value={selectedExpenseMemberId}
                      onChange={e => handleSelectExpensePayee(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      <option value="">-- Select Member / Staff Member --</option>
                      {membersList.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.first_name} {m.last_name} ({m.primary_role || m.role || 'Member'})
                        </option>
                      ))}
                      <option value="custom">+ Enter Non-Member Vendor / Custom Name...</option>
                    </select>
                    {expensePayee && (
                      <p className="text-[11px] text-rose-800 font-bold bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200 flex items-center justify-between">
                        <span>Payee: <strong>{expensePayee}</strong></span>
                        <button type="button" onClick={() => setExpensePayeeType('non_member')} className="text-indigo-600 hover:underline text-[10px] cursor-pointer">
                          Edit Name
                        </button>
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sierra Leone Electricity Co (EDSA) or Sound Tech Vendor"
                    value={expensePayee}
                    onChange={e => setExpensePayee(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Expense Category *</label>
                  <select
                    value={expenseCategory}
                    onChange={e => setExpenseCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                  >
                    <option value="Pastoral & Staff Stipends">Pastoral & Staff Stipends</option>
                    <option value="Utilities & Electricity">Utilities & Electricity</option>
                    <option value="Building Maintenance">Building Maintenance</option>
                    <option value="Ministry & Worship Budgets">Ministry & Worship Budgets</option>
                    <option value="Evangelism & Missions">Evangelism & Missions</option>
                    <option value="Media & IT Equipment">Media & IT Equipment</option>
                  </select>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Disbursement Amount ({givingConfig.currency_symbol || 'SLE'}) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="250.00"
                    value={expenseAmount}
                    onChange={e => setExpenseAmount(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-rose-600 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2 text-slate-500 font-bold">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 bg-rose-600 text-white font-black rounded-xl hover:bg-rose-700 shadow-md">
                  Save Expenditure Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT RECEIPT MODAL */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                showPrintModal.type === 'expense' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {showPrintModal.type === 'expense' ? 'Disbursement Voucher' : 'Official Revenue Receipt'}
              </span>
              <button onClick={() => setShowPrintModal(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">{showPrintModal.type === 'expense' ? 'Payee / Vendor:' : 'Contributor:'}</span>
                <strong className="text-slate-900">{showPrintModal.contributor_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Category:</span>
                <strong className="text-indigo-600">{showPrintModal.category}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount:</span>
                <strong className={`text-base ${showPrintModal.type === 'expense' ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {showPrintModal.currency || 'SLE'} {Number(showPrintModal.amount).toLocaleString()}
                </strong>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer size={15} /> Print Official Document
            </button>
          </div>
        </div>
      )}

      {/* MOBILE & TABLET BOTTOM NAV BAR (Fixed at bottom on < lg screens) */}
      <nav className="block lg:hidden fixed bottom-0 inset-x-0 z-[95] bg-slate-900/95 backdrop-blur-md border-t border-slate-800 shadow-2xl p-1.5">
        <div className="grid grid-cols-4 gap-1 max-w-lg mx-auto">
          <button
            onClick={() => setWorkspaceTab('ledger')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer relative ${
              workspaceTab === 'ledger'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <PieChart size={18} />
            <span className="mt-0.5 truncate w-full text-center">Ledger</span>
          </button>

          <button
            onClick={() => setWorkspaceTab('requisitions')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer relative ${
              workspaceTab === 'requisitions'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShoppingCart size={18} />
            <span className="mt-0.5 truncate w-full text-center">Proposals</span>
            {pendingReqsCount > 0 && (
              <span className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse border-2 border-slate-900" />
            )}
          </button>

          <button
            onClick={() => setWorkspaceTab('event_budgets')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer relative ${
              workspaceTab === 'event_budgets'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Calendar size={18} />
            <span className="mt-0.5 truncate w-full text-center">Budgets</span>
            {eventBudgets.filter(b => b.status === 'pending_approval').length > 0 && (
              <span className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse border-2 border-slate-900" />
            )}
          </button>

          <button
            onClick={() => setWorkspaceTab('gateways')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer relative ${
              workspaceTab === 'gateways'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sliders size={18} />
            <span className="mt-0.5 truncate w-full text-center">Gateways</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

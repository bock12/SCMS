import React, { useEffect, useRef, useState } from 'react';
import { FinanceDatabaseSessionGate } from './FinanceDatabaseSessionGate';
import { useLocation, useNavigate } from 'react-router-dom';
import { financeSupabase } from './financeSupabaseClient';
import { getFinanceLedgerEntries, mapFinanceLedgerEntriesToWorkspaceRecords } from './financeLedgerService';
import { hasEffectivePermission } from './permissionResolutionService';
import { usePermissionResolution } from './usePermissionResolution';
import { Profile, FinancialRecord, GivingConfig, MobileMoneyGateway, GivingFund, DepartmentRequisition, RequisitionItem, EventBudgetApproval } from './types';
import { getGivingConfig, saveGivingConfig } from './givingConfig';
import { getRequisitions, saveRequisitions, getDepartmentFinancialStanding, getDatabaseRequisitions, decideDatabaseRequisitionApproval } from './requisitionService';
import { getEventBudgets } from './eventBudgetFinanceService';
import { getEventBudgetApprovals } from './eventBudgetService';
import { getChurchProfile } from './churchProfileService';
import { FinanceConfigurationWorkspace } from './FinanceConfigurationWorkspace';
import { getMyFinanceScopes, type FinanceOwnershipScope, type FinanceScopeOption } from './financeConfigurationService';
import { EventBudgetFinanceWorkspace } from './EventBudgetFinanceWorkspace';
import { FinanceDocumentWorkflowWorkspace } from './FinanceDocumentWorkflowWorkspace';
import { FinanceJournalWorkspace } from './FinanceJournalWorkspace';
import { FinanceTransactionEntryWorkspace } from './FinanceTransactionEntryWorkspace';
import { FinanceTransferWorkspace } from './FinanceTransferWorkspace';
import { DepartmentRequisitionPaymentWorkspace } from './DepartmentRequisitionPaymentWorkspace';
import { 
  DollarSign, Sliders, Plus, Clock, Check, X, Printer, Filter, 
  Search, Landmark, Smartphone, RefreshCw, Layers, ShieldCheck, 
  Trash2, Edit, AlertCircle, FileText, CheckCircle2, ArrowRightLeft,
  ArrowUpRight, ArrowDownRight, PieChart, Calendar, ShoppingCart, Send, FileCode, CheckSquare, Shield, Upload, Bell, CheckCircle
} from 'lucide-react';

interface FinanceOfficerWorkspaceProps {
  profile: Profile | null;
  databaseBranchId?: string | null;
  databaseProfileId?: string | null;
  /** Optional explicit church or district scope; defaults to the authenticated profile's branch. */
  financeScope?: FinanceOwnershipScope;
}

type FinanceWorkspaceTab = 'ledger' | 'transfers' | 'requisitions' | 'event_budgets' | 'gateways' | 'setup';

const VALID_FINANCE_TABS: FinanceWorkspaceTab[] = ['ledger', 'transfers', 'requisitions', 'event_budgets', 'gateways', 'setup'];

const FinanceOfficerWorkspaceContent: React.FC<FinanceOfficerWorkspaceProps> = ({ profile, databaseBranchId, databaseProfileId, financeScope }) => {
  const financeBranchId = databaseBranchId ?? profile?.branch_id ?? null;
  const [availableFinanceScopes, setAvailableFinanceScopes] = useState<FinanceScopeOption[]>([]);
  const [selectedFinanceScope, setSelectedFinanceScope] = useState<FinanceOwnershipScope | null>(null);
  const [financeScopeLoading, setFinanceScopeLoading] = useState(true);
  const [financeScopeError, setFinanceScopeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFinanceScopeLoading(true);
    setFinanceScopeError(null);
    getMyFinanceScopes().then(result => {
      if (cancelled) return;
      if (result.error) {
        setAvailableFinanceScopes([]);
        setSelectedFinanceScope(null);
        setFinanceScopeError(result.error.message);
        return;
      }
      const scopes = result.data || [];
      setAvailableFinanceScopes(scopes);
      const matches = (scope: FinanceOwnershipScope | undefined) => scope
        ? scopes.find(item => item.scope_type === scope.type && item.scope_id === scope.id)
        : undefined;
      const requested = matches(financeScope);
      const branchDefault = financeBranchId
        ? scopes.find(item => item.scope_type === 'branch' && item.scope_id === financeBranchId)
        : undefined;
      const selected = requested || branchDefault || scopes[0];
      setSelectedFinanceScope(selected
        ? { type: selected.scope_type, id: selected.scope_id } as FinanceOwnershipScope
        : null);
      if (!selected) setFinanceScopeError('Your authenticated account has no finance configuration scope.');
    }).finally(() => {
      if (!cancelled) setFinanceScopeLoading(false);
    });
    return () => { cancelled = true; };
  }, [databaseProfileId, financeBranchId, financeScope?.type, financeScope?.id]);
  const permissionBranchContext = selectedFinanceScope?.type === 'branch'
    ? selectedFinanceScope.id
    : selectedFinanceScope?.type === 'district'
      ? (availableFinanceScopes.find(item => item.scope_type === 'branch' && item.district_id === selectedFinanceScope.id)?.scope_id ?? financeBranchId)
      : financeBranchId;
  const { resolution: financePermissions, loading: financePermissionsLoading } = usePermissionResolution(profile?.id, permissionBranchContext);
  const canViewFinance = hasEffectivePermission(financePermissions, 'view_finances')
    || hasEffectivePermission(financePermissions, 'manage_finances')
    || availableFinanceScopes.length > 0;
  const canCreateScopedTransactions = hasEffectivePermission(financePermissions, 'manage_finances')
    || (selectedFinanceScope?.type === 'district' && availableFinanceScopes.some(item => item.scope_type === 'district' && item.scope_id === selectedFinanceScope.id));
  const canApproveRequisitions = hasEffectivePermission(financePermissions, 'approve_requisitions');
  const canAccessFinance = canViewFinance || canApproveRequisitions;
  const location = useLocation();
  const navigate = useNavigate();
  const resolveTabFromSearch = (search: string): FinanceWorkspaceTab => {
    const raw = new URLSearchParams(search).get('tab') as FinanceWorkspaceTab | null;
    return raw && VALID_FINANCE_TABS.includes(raw) ? raw : 'ledger';
  };
  const [workspaceTab, setWorkspaceTabState] = useState<FinanceWorkspaceTab>(() =>
    resolveTabFromSearch(location.search)
  );

  useEffect(() => {
    const nextTab = resolveTabFromSearch(location.search);
    setWorkspaceTabState(prev => (prev === nextTab ? prev : nextTab));
  }, [location.search]);

  const setWorkspaceTab = (tab: FinanceWorkspaceTab) => {
    if (!canViewFinance && tab !== 'requisitions') return;
    setWorkspaceTabState(tab);
    navigate(`/portal/finance?tab=${tab}`, { replace: true });
  };
  useEffect(() => {
    if (canApproveRequisitions && !canViewFinance) setWorkspaceTabState('requisitions');
  }, [canApproveRequisitions, canViewFinance]);

  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [givingConfig, setGivingConfig] = useState<GivingConfig>(getGivingConfig());
  const [churchProfile, setChurchProfile] = useState(getChurchProfile());

  useEffect(() => {
    const handleProfileUpdate = () => setChurchProfile(getChurchProfile());
    window.addEventListener('church-profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('church-profile-updated', handleProfileUpdate);
  }, []);

  // Requisitions & Event Budgets State
  const [requisitions, setRequisitions] = useState<DepartmentRequisition[]>([]);
  const [requisitionError, setRequisitionError] = useState<string | null>(null);
  const [eventBudgets, setEventBudgets] = useState<Array<Record<string, any>>>([]);

  // Sync Requisitions and Event Budgets with Service
  const reloadRequisitions = async () => {
    setRequisitionError(null);
    if (!financeBranchId) {
      setRequisitions([]);
      setEventBudgets([]);
      return;
    }
    const [requisitionResult, eventBudgetResult] = await Promise.all([
      getDatabaseRequisitions(financeBranchId),
      getEventBudgets(financeBranchId)
    ]);
    if (requisitionResult.error) {
      setRequisitionError(requisitionResult.error.message);
      setRequisitions([]);
    } else {
      setRequisitions(requisitionResult.data || []);
    }
    setEventBudgets(eventBudgetResult.error ? [] : eventBudgetResult.data?.budgets || []);
  };

  useEffect(() => {
    void reloadRequisitions();
    const handleUpdate = () => { void reloadRequisitions(); };
    window.addEventListener('requisitions_updated', handleUpdate);
    window.addEventListener('event_budgets_updated', handleUpdate);
    return () => {
      window.removeEventListener('requisitions_updated', handleUpdate);
      window.removeEventListener('event_budgets_updated', handleUpdate);
    };
  }, [financeBranchId]);

  // Ledger Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'week' | 'month' | 'quarter' | 'year'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_verification' | 'completed' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Canonical Transaction Entry Shortcut State
  const [requestedEntryType, setRequestedEntryType] = useState<{ type: 'receipt' | 'payment'; nonce: number } | null>(null);
  const transactionEntrySectionRef = useRef<HTMLDivElement | null>(null);
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
    const { data, error } = await financeSupabase
      .from('profiles')
      .select('id,first_name,last_name,email,phone,branch_id')
      .order('first_name', { ascending: true });
    if (error) {
      setMembersList([]);
      setLedgerError(current => current || error.message);
      return;
    }
    setMembersList((data || []) as unknown as Profile[]);
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
    setLedgerError(null);
    const { data, error } = await getFinanceLedgerEntries();
    if (error) {
      setRecords([]);
      setLedgerError(error.message || 'The finance ledger could not be loaded.');
    } else {
      setRecords(mapFinanceLedgerEntriesToWorkspaceRecords(data || []));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
    fetchMembers();
    setGivingConfig(getGivingConfig());
    const handleDocumentsUpdated = () => { void fetchRecords(); };
    window.addEventListener('finance_documents_updated', handleDocumentsUpdated);
    return () => window.removeEventListener('finance_documents_updated', handleDocumentsUpdated);
  }, []);

  const handlePersistConfig = (updated: GivingConfig) => {
    setGivingConfig(updated);
    saveGivingConfig(updated);
  };

  const openCanonicalTransactionEntry = (type: 'receipt' | 'payment') => {
    setRequestedEntryType({ type, nonce: Date.now() });
    setWorkspaceTab('ledger');
    window.requestAnimationFrame(() => {
      transactionEntrySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Persist a disbursement ledger entry exactly once. Deterministic IDs make retries safe.
  const persistDisbursementRecord = async (_record: FinancialRecord): Promise<FinancialRecord> => {
    throw new Error('Disbursement posting is temporarily unavailable until the secure financial-document, approval and journal-posting workflow is integrated.');
  };

  const normalizeDisbursementPaymentMethod = (method?: string): FinancialRecord['payment_method'] => {
    switch ((method || '').toLowerCase()) {
      case 'cash':
      case 'mobile_money':
      case 'bank_transfer':
      case 'card':
      case 'check':
        return method!.toLowerCase() as FinancialRecord['payment_method'];
      case 'bank_wire':
      case 'church_treasury':
      default:
        return 'bank_transfer';
    }
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

  const handleApproveRequisition = async (reqId: string) => {
    const requisition = requisitions.find(item => item.id === reqId);
    const currentStep = requisition?.approval_steps?.find(step => step.actor_can_decide);
    if (!currentStep) {
      alert('There is no requisition approval step currently assigned to your permissions. Earlier steps may still be pending.');
      return;
    }
    const result = await decideDatabaseRequisitionApproval(
      currentStep.id, 'approved',
      profile ? `Approved by ${profile.first_name} ${profile.last_name}` : undefined
    );
    if (result.error) {
      alert(result.error.message);
      return;
    }
    await reloadRequisitions();
  };

  const handleRejectRequisition = async (reqId: string) => {
    if (!confirm('Are you sure you want to reject this funding proposal?')) return;
    const requisition = requisitions.find(item => item.id === reqId);
    const currentStep = requisition?.approval_steps?.find(step => step.actor_can_decide);
    if (!currentStep) {
      alert('There is no requisition approval step currently assigned to your permissions. Earlier steps may still be pending.');
      return;
    }
    const result = await decideDatabaseRequisitionApproval(
      currentStep.id, 'rejected',
      profile ? `Rejected by ${profile.first_name} ${profile.last_name}` : undefined
    );
    if (result.error) {
      alert(result.error.message);
      return;
    }
    await reloadRequisitions();
  };

  const openDisbursementModal = (req: DepartmentRequisition) => {
    if (req.approval_request_id) {
      alert('The requisition is approved, but source-linked payment creation is not available yet. Create a payment through canonical Finance Transaction Entry; do not mark this requisition as disbursed.');
      return;
    }
    setDisburseReq(req);
    setDisbursementInvoiceNo(`INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setDisbursementTxnRef(`WIRE-SLCB-${Math.floor(100000 + Math.random() * 900000)}`);
    setVendorReceiptUrl(req.vendor_quote_url || 'Vendor_Tax_Receipt_Signed.pdf');
  };

  const handleConfirmInvoiceAndDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disburseReq) return;
    if (disburseReq.status !== 'approved') {
      alert('Only fully approved requisitions can proceed to payment creation. Requisition approval does not itself record a payment.');
      return;
    }

    const txnRef = disbursementTxnRef.trim() || ('DISB-SLCB-' + Math.floor(100000 + Math.random() * 900000));
    const actor = profile ? profile.first_name + ' ' + profile.last_name : 'Finance Officer / Treasury';
    const now = new Date().toISOString();

    const autoExpenseRecord: FinancialRecord = {
      id: 'rec-disb-' + disburseReq.id,
      contributor_name: disburseReq.department_name + ' (' + disburseReq.applicant_name + ')',
      type: 'expense',
      category: disburseReq.department_name.includes('Media') ? 'Media & IT Equipment' : 'Ministry & Worship Budgets',
      amount: disburseReq.requested_amount,
      currency: disburseReq.currency || 'SLE',
      date: now,
      payment_method: normalizeDisbursementPaymentMethod(disburseReq.disbursement_method),
      status: 'completed',
      approved_by: actor,
      transaction_id: txnRef,
      payment_proof_ref: vendorReceiptUrl.trim() || undefined,
      notes: 'Church Expense Invoice ' + disbursementInvoiceNo + ': ' + disburseReq.title
    };

    try {
      // Save the ledger entry first. If the status update fails, a retry reuses this same ID.
      const savedRecord = await persistDisbursementRecord(autoExpenseRecord);
      // Reuse the ledger's original reference on retry so both records stay linked.
      const confirmedTxnRef = savedRecord.transaction_id || txnRef;
      const updatedReqs = getRequisitions().map(r => r.id === disburseReq.id ? {
        ...r,
        status: 'disbursed' as const,
        transaction_ref: confirmedTxnRef,
        vendor_quote_url: vendorReceiptUrl || r.vendor_quote_url,
        disbursed_at: r.disbursed_at || now,
        disbursed_by: r.disbursed_by || actor
      } : r);

      saveRequisitions(updatedReqs);
      const confirmedReq = getRequisitions().find(r => r.id === disburseReq.id);
      if (!confirmedReq || confirmedReq.status !== 'disbursed' || confirmedReq.transaction_ref !== confirmedTxnRef) {
        throw new Error('The ledger entry was saved, but the requisition status could not be confirmed. Retry this disbursement to complete the status update without duplicating the ledger entry.');
      }

      setRequisitions(getRequisitions());
      setRecords(prev => [savedRecord, ...prev.filter(record => record.id !== savedRecord.id)]);
      setDisburseReq(null);
      setDisbursementTxnRef('');
      setVendorReceiptUrl('');
      alert('Expense Invoice ' + disbursementInvoiceNo + ' processed! SLE ' + disburseReq.requested_amount.toLocaleString() + ' has been disbursed and linked to the Treasury Financial Ledger.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert('Disbursement was not fully completed: ' + message);
    }
  };

  const openEventBudgetDisbursementModal = (b: EventBudgetApproval) => {
    setDisburseEventBudget(b);
    setEvtDisburseTxnRef(`DISB-EVT-${Math.floor(100000 + Math.random() * 900000)}`);
    setEvtDisburseAccountInfo('Afrimoney / Orange Money Ministry Account');
    setEvtDisburseProofUrl('Bank_Payment_Receipt_Signed.pdf');
  };

  const handleConfirmEventBudgetDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disburseEventBudget) return;
    setDisburseEventBudget(null);
    alert('Legacy event-budget disbursement is disabled. Use the canonical event budget workflow to create an approved payment and journal.');
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

          <h2 style="font-size: 18px; margin-bottom: 5px;">DEPARTMENT FUNDING REQUISITION</h2>
          <p style="font-size: 12px; color: #475569; margin-top: 0;">Request for ministry or department funding. This document is not a payment voucher.</p>

          <div class="grid">
            <div>
              <strong>Department / Ministry:</strong> ${req.department_name}<br/>
              <strong>Applicant Lead:</strong> ${req.applicant_name} (${req.applicant_role || 'Lead'})<br/>
              <strong>Proposal Title:</strong> ${req.title}
            </div>
            <div>
              <strong>Priority Level:</strong> ${req.priority.toUpperCase()}<br/>
              <strong>Approval Status:</strong> ${req.status.replace(/_/g, ' ')}<br/>
              <strong>Payment Status:</strong> Not created — Finance handles payment after approval
            </div>
          </div>

          <h3 style="font-size: 14px; margin-bottom: 10px;">Requisition Item Breakdown</h3>
          <table>
            <thead>
              <tr>
                <th>Item Description</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Unit Price (${req.currency || 'SLE'})</th>
                <th style="text-align: right;">Line Total (${req.currency || 'SLE'})</th>
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
            Total Requested Amount: ${req.currency || 'SLE'} ${req.requested_amount.toLocaleString()}
          </div>

          ${req.vendor_quote_reference || req.vendor_quote_url ? `
            <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; font-size: 12px; margin-bottom: 30px;">
              <strong>Vendor Quote Reference:</strong> ${req.vendor_quote_reference || req.vendor_quote_url}
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
              <strong>Requisition Approval</strong><br/>
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

  const pendingCount = periodRecords.filter(r => r.status === 'pending_verification').length;
  const pendingAmount = periodRecords.filter(r => r.status === 'pending_verification').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);


  const pendingReqsCount = requisitions.filter(r => r.status === 'pending_approval').length;

  if (financePermissionsLoading || (financeScopeLoading && !canAccessFinance)) {
    return <div className="p-10 text-center text-slate-500">Loading finance permissions…</div>;
  }
  if (!profile || !canAccessFinance) {
    return <div className="p-10 text-center text-slate-500 font-bold">Access denied. Your active role assignments do not grant finance access.</div>;
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      {/* Requisition Approver Alert for Pending Ministry Requests */}
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
            {selectedFinanceScope?.type === 'branch' && (
            <button
              onClick={() => setWorkspaceTab('transfers')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[40px] ${
                workspaceTab === 'transfers'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowRightLeft size={15} />
              <span>Internal Transfers</span>
            </button>
          )}

            onClick={() => setWorkspaceTab('requisitions')}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs shadow-md transition-all shrink-0 cursor-pointer"
          >
            Review Requisitions &rarr;
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
                {canViewFinance ? 'Finance Officer Console' : 'Requisition Approval Console'}
              </span>
              <span className="text-xs text-slate-400 font-semibold">• Base currency: configured in Accounting Setup</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{canViewFinance ? 'Church Financial Operations' : 'Requisition Approvals'}</h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              {canViewFinance ? 'Create canonical receipts and payments, review approval workflows, explicitly post journals and monitor posted accounting balances.' : 'Review branch requisitions and record only the approval step assigned to your permissions.'}
            </p>
          </div>

          {ledgerError && (
            <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
              Finance ledger unavailable: {ledgerError}. No demo records have been substituted.
            </div>
          )}
          {canViewFinance ? (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
              <button
                title="Open canonical receipt entry"
                onClick={() => openCanonicalTransactionEntry('receipt')}
                className="px-3.5 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all min-h-[44px]"
              >
                <Plus size={16} />
                <span>Record Income</span>
              </button>
  
              <button
                title="Open canonical payment entry"
                onClick={() => openCanonicalTransactionEntry('payment')}
                className="px-3.5 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all min-h-[44px]"
              >
                <Plus size={16} />
                <span>Record Expense</span>
              </button>
  
              <button
                onClick={() => setWorkspaceTab('ledger')}
                className="col-span-2 sm:col-span-1 px-3.5 sm:px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all min-h-[44px]"
              >
                <Printer size={16} />
                <span>Open Posted Reports</span>
              </button>
            </div>
          ) : null}
        </div>

        {canViewFinance ? (
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
              <span>Journal Ledger</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200">Journal</span>
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
              onClick={() => setWorkspaceTab('setup')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[40px] ${
                workspaceTab === 'setup'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Landmark size={15} />
              <span>Accounting Setup</span>
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
        ) : (
          <div className="flex items-center pt-1">
            <button
              onClick={() => setWorkspaceTab('requisitions')}
              className="px-4 py-2.5 rounded-xl text-xs font-black bg-indigo-600 text-white"
            >
              <ShoppingCart size={15} /> Requisition Approvals
            </button>
          </div>
        )}
      </div>

      {(workspaceTab === 'ledger' || workspaceTab === 'setup' || workspaceTab === 'transfers') && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <label htmlFor="finance-configuration-scope" className="block text-xs font-black uppercase tracking-wide text-indigo-900">Finance organizational scope</label>
              <p className="mt-1 text-xs leading-5 text-indigo-800">Only church, district and branch scopes authorized by your authenticated Supabase account are listed here.</p>
            </div>
            <select
              id="finance-configuration-scope"
              aria-label="Finance configuration scope"
              value={selectedFinanceScope ? `${selectedFinanceScope.type}:${selectedFinanceScope.id ?? 'church'}` : ''}
              onChange={event => {
                const selected = availableFinanceScopes.find(item =>
                  `${item.scope_type}:${item.scope_id ?? 'church'}` === event.target.value);
                setSelectedFinanceScope(selected
                  ? { type: selected.scope_type, id: selected.scope_id } as FinanceOwnershipScope
                  : null);
              }}
              disabled={financeScopeLoading || availableFinanceScopes.length <= 1}
              className="min-w-56 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
            >
              {availableFinanceScopes.map(item => (
                <option key={`${item.scope_type}:${item.scope_id ?? 'church'}`} value={`${item.scope_type}:${item.scope_id ?? 'church'}`}>
                  {item.scope_type === 'church' ? 'Church-wide' : `${item.scope_type === 'district' ? 'District' : 'Branch'} — ${item.scope_name}`}
                </option>
              ))}
            </select>
          </div>
          {financeScopeLoading && <p className="mt-2 text-xs text-indigo-700">Loading authorized finance scopes…</p>}
          {financeScopeError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{financeScopeError}</p>}
        </div>
      )}

      {/* --- WORKSPACE TAB 1: FINANCIAL LEDGER & REPORTS --- */}
      {workspaceTab === 'ledger' && (
        <div className="space-y-6">
          {selectedFinanceScope ? (
            <>
              {canCreateScopedTransactions && (
                <div ref={transactionEntrySectionRef}>
                  <FinanceTransactionEntryWorkspace
                    branchId={selectedFinanceScope.type === 'branch' ? selectedFinanceScope.id : null}
                    scope={selectedFinanceScope}
                    requestedEntryType={requestedEntryType}
                  />
                </div>
              )}
              <FinanceDocumentWorkflowWorkspace
                branchId={selectedFinanceScope.type === 'branch' ? selectedFinanceScope.id : null}
                scope={selectedFinanceScope}
              />
              <FinanceJournalWorkspace
                branchId={selectedFinanceScope.type === 'branch' ? selectedFinanceScope.id : null}
                scope={selectedFinanceScope}
              />
            </>
          ) : !financeScopeLoading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              Canonical transactions, approvals and journal balances are unavailable until an authorized organizational scope is confirmed by Supabase.
            </div>
          ) : null}
          {/* Revenue, expenditure and net-position figures are now rendered from
              posted journal lines in FinanceJournalWorkspace above. Do not restore
              the legacy FinancialRecord-derived summary cards here. */}

          {/* Department/event budget allocations are operational planning data, not posted accounting expenditure. */}

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

              <span className="text-[10px] font-semibold text-slate-500">Legacy records below are not included in official reports.</span>
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

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <strong>Legacy financial records — informational only.</strong> These historical/demo records are not canonical financial documents or posted journal entries and are excluded from official CSV/PDF reports and ledger balances.
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

      {/* --- WORKSPACE TAB 2: ACCOUNTING SETUP --- */}
      {workspaceTab === 'transfers' && (
        <section className="space-y-4">
          {selectedFinanceScope?.type === 'branch' ? (
            <FinanceTransferWorkspace
              branchId={selectedFinanceScope.id}
              branchOptions={availableFinanceScopes}
              canCreate={canCreateScopedTransactions}
            />
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              Internal transfers are managed from a branch finance scope. Select a branch scope to create, review or approve transfers.
            </div>
          )}
        </section>
      )}

      {workspaceTab === 'setup' && (
        <section className="space-y-4">
          {selectedFinanceScope ? (
            <FinanceConfigurationWorkspace
              branchId={selectedFinanceScope.type === 'branch' ? selectedFinanceScope.id : null}
              scope={selectedFinanceScope}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              Finance configuration is unavailable until an authorized scope can be confirmed by Supabase.
            </div>
          )}
        </section>
      )}

      {workspaceTab === 'requisitions' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <strong>Requisition approval is not payment.</strong> Approved requisitions can now receive separately approved canonical payments. A requisition is shown as paid only from its linked posted journal; pending and approved-but-unposted payments remain reservations, not expenditure.
          </div>
          {hasEffectivePermission(financePermissions, 'manage_finances') && (
            <DepartmentRequisitionPaymentWorkspace branchId={financeBranchId} requisitions={requisitions as any[]} />
          )}

          {/* Requisitions Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-amber-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-amber-700 tracking-wider block">Awaiting Approval</span>
              <div className="text-2xl font-black text-amber-600">
                {requisitions.filter(r => r.status === 'pending_approval').length} Proposals
              </div>
              <p className="text-[11px] text-slate-400">Waiting for configured approval steps</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-purple-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-purple-700 tracking-wider block">Approved — Payment Pending</span>
              <div className="text-2xl font-black text-purple-700">
                {requisitions.filter(r => r.status === 'approved').length} Approved
              </div>
              <p className="text-[11px] text-slate-400">No payment or journal is created yet</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-indigo-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-indigo-700 tracking-wider block">Rejected Requests</span>
              <div className="text-2xl font-black text-indigo-600">
                {requisitions.filter(r => r.status === 'rejected').length} Rejected
              </div>
              <p className="text-[11px] text-slate-400">Requires review before resubmission</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-xs space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-wider block">Total Requests</span>
              <div className="text-2xl font-black text-emerald-600">
                {requisitions.length} Requisitions
              </div>
              <p className="text-[11px] text-slate-400">Branch-visible requisitions</p>
            </div>
          </div>

          {requisitionError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">Unable to load database requisitions: {requisitionError}</div>}
          {/* Requisitions List */}
          <div className="space-y-4">
            {requisitions.map(req => {
              const isUrgent = req.priority === 'urgent' || req.priority === 'high';
              const currentApprovalStep = req.approval_steps?.find(step => step.actor_can_decide);

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
                        req.status === 'rejected' ? 'bg-rose-100 text-rose-800 font-bold' :
                        req.status === 'submitted_to_board' ? 'bg-purple-100 text-purple-800 animate-bounce' :
                        req.status === 'approved' ? 'bg-indigo-100 text-indigo-800 font-bold' :
                        req.status === 'disbursed' ? 'bg-emerald-100 text-emerald-800 font-bold' :
                        req.status === 'reconciled' ? 'bg-teal-100 text-teal-800 font-bold' :
                        req.status === 'settled' ? 'bg-emerald-800 text-white font-bold' :
                        'bg-rose-100 text-rose-800'
                      }`}>
                        {req.status === 'pending_pastor_approval' ? 'Step 1: Awaiting Senior Pastor Approval' :
                         req.status === 'pastor_approved' ? 'Step 2: Approved by Senior Pastor — Disburse Now' :
                         req.status === 'pending_approval' ? 'Awaiting Configured Approval Steps' : 
                         req.status === 'submitted_to_board' ? 'Escalated to Senior Pastor & Board' :
                         req.status === 'approved' ? 'Approved — Payment Not Created' :
                          req.status === 'rejected' ? 'Rejected' :
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
                          <strong className="font-mono text-slate-900">{req.currency || 'SLE'} {item.total_price.toLocaleString()}</strong>
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

                  {/* Approval and payment actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-slate-500 font-medium">
                      {req.status === 'approved' && <span className="text-emerald-700 font-semibold">Approved. Payment creation is a separate finance workflow.</span>}
                      {req.status === 'pending_approval' && !currentApprovalStep && <span>Waiting for an earlier step or another authorized approver.</span>}
                      {req.approval_request?.status && <span className="ml-2">Approval request: <strong>{req.approval_request.status}</strong></span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {req.status === 'pending_approval' && currentApprovalStep && (
                        <>
                          <button
                            onClick={() => void handleApproveRequisition(req.id)}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                          >
                            Approve Step {currentApprovalStep.step_number}
                          </button>
                          <button
                            onClick={() => void handleRejectRequisition(req.id)}
                            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handlePrintRequisitionVoucher(req)}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer size={14} /> Print Requisition
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
        <section className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h3 className="text-lg font-black">Payment-channel integration is not connected yet</h3>
          <p className="mt-2 text-sm leading-6">External mobile-money providers and bank-transfer instructions are not yet backed by a verified provider integration and persisted settings API. Sample merchant codes, phone numbers and bank account details are intentionally not displayed or treated as real church payment destinations.</p>
          <p className="mt-3 text-sm leading-6">Use Accounting Setup to manage the church's actual financial accounts, funds, currencies and approval policies. Provider configuration will be enabled after its secure database and provider integration is implemented.</p>
        </section>
      )}

      {workspaceTab === 'event_budgets' && (
        <EventBudgetFinanceWorkspace branchId={financeBranchId} profileId={databaseProfileId || null} />
      )}

      {/* MOBILE & TABLET BOTTOM NAV BAR (Fixed at bottom on < lg screens) */}
      <nav className="block lg:hidden fixed bottom-0 inset-x-0 z-20 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 shadow-2xl p-1.5">
        {canViewFinance ? (
          <div className="grid grid-cols-5 gap-1 max-w-2xl mx-auto">
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
              onClick={() => setWorkspaceTab('setup')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer relative ${
                workspaceTab === 'setup'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Landmark size={18} />
              <span className="mt-0.5 truncate w-full text-center">Setup</span>
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
        ) : (
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => setWorkspaceTab('requisitions')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-extrabold bg-indigo-600 text-white"
            >
              <ShoppingCart size={18} /> Requisition Approvals
            </button>
          </div>
        )}
      </nav>
    </div>
  );
};


/** Keep mock login for UI testing, but gate Finance behind verified Supabase Auth. */
export const FinanceOfficerWorkspace: React.FC<FinanceOfficerWorkspaceProps> = ({ profile, financeScope }) => (
  <FinanceDatabaseSessionGate mockProfile={profile}>
    {databaseProfile => (
      <FinanceOfficerWorkspaceContent
        profile={profile}
        databaseBranchId={databaseProfile.branch_id}
        databaseProfileId={databaseProfile.id}
        financeScope={financeScope}
      />
    )}
  </FinanceDatabaseSessionGate>
);

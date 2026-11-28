import React, { useEffect, useState } from 'react';
import { FinanceDatabaseSessionGate } from './FinanceDatabaseSessionGate';
import { useLocation, useNavigate } from 'react-router-dom';
import { financeSupabase } from './financeSupabaseClient';
import { getFinanceLedgerEntries, mapFinanceLedgerEntriesToWorkspaceRecords } from './financeLedgerService';
import { hasEffectivePermission } from './permissionResolutionService';
import { usePermissionResolution } from './usePermissionResolution';
import { Profile, FinancialRecord, GivingConfig, MobileMoneyGateway, GivingFund, DepartmentRequisition, EventBudgetApproval } from './types';
import { getGivingConfig, saveGivingConfig } from './givingConfig';
import { getDatabaseRequisitions } from './requisitionService';
import { getEventBudgets } from './eventBudgetFinanceService';
import { getEventBudgetApprovals } from './eventBudgetService';
import { getChurchProfile } from './churchProfileService';
import { FinanceConfigurationWorkspace } from './FinanceConfigurationWorkspace';
import { getMyFinanceScopes, type FinanceOwnershipScope, type FinanceScopeOption } from './financeConfigurationService';
import { EventBudgetFinanceWorkspace } from './EventBudgetFinanceWorkspace';
import { FinanceDocumentWorkflowWorkspace } from './FinanceDocumentWorkflowWorkspace';
import { getScopedFinanceWorkflowDocuments, type FinanceWorkflowDocument } from './financeDocumentWorkflowService';
import { FinanceJournalWorkspace } from './FinanceJournalWorkspace';
import { FinanceTransactionEntryWorkspace, type RejectedTransactionPrefillDraft } from './FinanceTransactionEntryWorkspace';
import { FinanceTransferWorkspace } from './FinanceTransferWorkspace';
import { DepartmentRequisitionWorkspace } from './DepartmentRequisitionWorkspace';
import { PaymentChannelsWorkspace } from './PaymentChannelsWorkspace';
import { 
  DollarSign, Sliders, Clock, Check, X, Printer, Filter, 
  Search, Landmark, Smartphone, RefreshCw, Layers, ShieldCheck, 
  Trash2, Edit, AlertCircle, FileText, CheckCircle2, ArrowRightLeft,
  ArrowUpRight, ArrowDownRight, PieChart, Calendar, ShoppingCart, Send, FileCode, CheckSquare, Shield, Upload, Bell, CheckCircle, MoreHorizontal
} from 'lucide-react';

interface FinanceOfficerWorkspaceProps {
  profile: Profile | null;
  databaseBranchId?: string | null;
  databaseProfileId?: string | null;
  /** Optional explicit church or district scope; defaults to the authenticated profile's branch. */
  financeScope?: FinanceOwnershipScope;
}

type FinanceWorkspaceTab = 'ledger' | 'documents' | 'transfers' | 'requisitions' | 'event_budgets' | 'gateways' | 'setup';

const VALID_FINANCE_TABS: FinanceWorkspaceTab[] = ['ledger', 'documents', 'transfers', 'requisitions', 'event_budgets', 'gateways', 'setup'];

const FinanceOfficerWorkspaceContent: React.FC<FinanceOfficerWorkspaceProps> = ({ profile, databaseBranchId, databaseProfileId, financeScope }) => {
  const financeBranchId = databaseBranchId ?? profile?.branch_id ?? null;
  const [availableFinanceScopes, setAvailableFinanceScopes] = useState<FinanceScopeOption[]>([]);
  const [selectedFinanceScope, setSelectedFinanceScope] = useState<FinanceOwnershipScope | null>(null);
  const [financeScopeLoading, setFinanceScopeLoading] = useState(true);
  const [financeScopeError, setFinanceScopeError] = useState<string | null>(null);
  const [setupHasUnsavedChanges, setSetupHasUnsavedChanges] = useState(false);
  const [pendingScopeSwitch, setPendingScopeSwitch] = useState<FinanceOwnershipScope | null>(null);

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
  const canApproveFinances = hasEffectivePermission(financePermissions, 'approve_finances');
  const canPostJournals = hasEffectivePermission(financePermissions, 'post_journals');
  const canApproveRequisitions = hasEffectivePermission(financePermissions, 'approve_requisitions');
  const canAccessFinance = canViewFinance || canApproveRequisitions;
  const location = useLocation();
  const navigate = useNavigate();
  const resolveTabFromSearch = (search: string): FinanceWorkspaceTab => {
    const raw = new URLSearchParams(search).get('tab');
    if (raw === 'approvals') return 'documents';
    return raw && VALID_FINANCE_TABS.includes(raw as FinanceWorkspaceTab)
      ? (raw as FinanceWorkspaceTab)
      : 'ledger';
  };
  const [workspaceTab, setWorkspaceTabState] = useState<FinanceWorkspaceTab>(() =>
    resolveTabFromSearch(location.search)
  );
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);

  useEffect(() => {
    const nextTab = resolveTabFromSearch(location.search);
    setWorkspaceTabState(prev => (prev === nextTab ? prev : nextTab));
  }, [location.search]);

  const setWorkspaceTab = (tab: FinanceWorkspaceTab) => {
    if (!canViewFinance && tab !== 'requisitions') return;
    setShowMobileMoreMenu(false);
    setPendingScopeSwitch(null);
    setWorkspaceTabState(tab);
    navigate(`/portal/finance?tab=${tab}`, { replace: true });
  };

  const requestFinanceScopeChange = (nextScope: FinanceOwnershipScope | null) => {
    if (!nextScope) {
      setPendingScopeSwitch(null);
      setSelectedFinanceScope(null);
      return;
    }
    const sameScope =
      selectedFinanceScope?.type === nextScope.type &&
      (selectedFinanceScope?.id ?? null) === (nextScope.id ?? null);
    if (sameScope) return;
    if (workspaceTab === 'setup' && setupHasUnsavedChanges) {
      setPendingScopeSwitch(nextScope);
      return;
    }
    setPendingScopeSwitch(null);
    setSelectedFinanceScope(nextScope);
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
  const [pendingDocsCount, setPendingDocsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refreshPendingDocsCount = async () => {
      if (!selectedFinanceScope || !canViewFinance) {
        if (!cancelled) setPendingDocsCount(0);
        return;
      }
      const res = await getScopedFinanceWorkflowDocuments(selectedFinanceScope);
      if (cancelled || res.error) return;
      const docs = res.data?.documents || [];
      setPendingDocsCount(docs.filter(doc => doc.status === 'pending_approval').length);
    };
    void refreshPendingDocsCount();
    const handleUpdated = () => {
      void refreshPendingDocsCount();
    };
    window.addEventListener('finance_documents_updated', handleUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('finance_documents_updated', handleUpdated);
    };
  }, [selectedFinanceScope?.type, selectedFinanceScope?.id, canViewFinance]);

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

  // Canonical Ledger Archive, Print & Rejected Resubmission State
  const [showPrintModal, setShowPrintModal] = useState<FinancialRecord | null>(null);
  const [showLegacyArchive, setShowLegacyArchive] = useState(false);
  const [prefillTransactionDraft, setPrefillTransactionDraft] = useState<RejectedTransactionPrefillDraft | null>(null);

  const handleResubmitRejectedDocument = (document: FinanceWorkflowDocument) => {
    const rejectedStep = document.approval_steps.find(step => step.decision === 'rejected' && step.comments);
    const ref = `${document.document_type === 'receipt' ? 'REC' : 'PAY'}-${String(document.document_number).padStart(6, '0')}`;
    const allowedMethods = ['cash', 'mobile_money', 'bank_transfer', 'cheque', 'card'] as const;
    const normalizedMethod = allowedMethods.includes(document.payment_method as any)
      ? (document.payment_method as (typeof allowedMethods)[number])
      : 'cash';
    setPrefillTransactionDraft({
      nonce: Date.now(),
      sourceReference: ref,
      rejectionReason: rejectedStep?.comments || null,
      documentType: document.document_type,
      transactionDate: document.transaction_date,
      partyName: document.payee_or_payer_name,
      profileId: document.profile_id,
      amount: Number(document.amount || 0),
      currencyCode: document.currency_code,
      paymentMethod: normalizedMethod,
      fundId: document.fund_id,
      externalReference: document.external_reference,
      description: document.description
    });
    setWorkspaceTab('ledger');
  };

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

  const openPostedReportsSection = () => {
    setWorkspaceTab('ledger');
    window.requestAnimationFrame(() => {
      document.getElementById('official-financial-reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const churchScopeOption = availableFinanceScopes.find(item => item.scope_type === 'church');
  const canOpenChurchScopeSetup = Boolean(churchScopeOption);
  const handleOpenAccountingSetup = (target?: 'church' | 'current') => {
    if (target === 'church' && churchScopeOption) {
      setSelectedFinanceScope({ type: 'church', id: null });
    }
    setWorkspaceTab('setup');
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


  const legacyCategoryOptions = Array.from(
    new Set([
      'Tithe',
      'Sunday Offering',
      'Building & Sanctuary Expansion',
      'Pastoral & Staff Stipends',
      'Utilities & Electricity',
      'Ministry & Worship Budgets',
      'Media & IT Equipment',
      ...records.map(r => r.category).filter(Boolean)
    ])
  ).sort((a, b) => a.localeCompare(b));

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
        <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/15 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <Bell size={19} />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Action Required · {pendingReqsCount} Pending Proposals
              </span>
              <h4 className="text-sm font-black mt-0.5">Ministry Funding Proposal Awaiting Review</h4>
              <p className="text-xs text-slate-300 mt-0.5">
                Ministry Leaders have submitted funding requests for equipment and department operations.
              </p>
            </div>
          </div>

          <button
            onClick={() => setWorkspaceTab('requisitions')}
            className="min-h-[40px] px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Review Requisitions &rarr;
          </button>
        </div>
      )}

      {/* Treasury Header */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1 text-xs font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wider text-amber-800">
                <ShieldCheck size={13} className="text-amber-700" />
                {canViewFinance ? 'Finance Officer Console' : 'Requisition Approval Console'}
              </span>
              <span>·</span>
              <span>Base currency configured in Accounting Setup</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {canViewFinance ? 'Church Financial Operations' : 'Requisition Approvals'}
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              {canViewFinance
                ? 'Create canonical receipts and payments, review approval workflows, explicitly post journals and monitor posted accounting balances.'
                : 'Review branch requisitions and record only the approval step assigned to your permissions.'}
            </p>
          </div>

          {ledgerError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
              Finance ledger unavailable: {ledgerError}. No demo records have been substituted.
            </div>
          )}
          {canViewFinance ? (
            <div className="flex items-center w-full sm:w-auto lg:w-auto">
              <button
                onClick={openPostedReportsSection}
                className="w-full sm:w-auto px-3.5 sm:px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[44px] sm:min-h-[40px] whitespace-nowrap shrink-0"
              >
                <Printer size={15} />
                <span>Open Posted Reports</span>
              </button>
            </div>
          ) : null}
        </div>

        {canViewFinance ? (
          <div className="hidden lg:flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 pb-0.5">
            <button
              onClick={() => setWorkspaceTab('ledger')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[40px] ${
                workspaceTab === 'ledger'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <PieChart size={15} />
              <span>Journal Ledger</span>
            </button>

            <button
              onClick={() => setWorkspaceTab('documents')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[40px] ${
                workspaceTab === 'documents'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck size={15} />
              <span>Documents &amp; Approvals</span>
              {pendingDocsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-400 text-slate-950 tabular-nums">
                  {pendingDocsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setWorkspaceTab('transfers')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[40px] ${
                workspaceTab === 'transfers'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowRightLeft size={15} />
              <span>Internal Transfers</span>
            </button>

            <button
              onClick={() => setWorkspaceTab('requisitions')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[40px] ${
                workspaceTab === 'requisitions'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingCart size={15} />
              <span>Ministry Proposals</span>
              {pendingReqsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-400 text-slate-950 tabular-nums">
                  {pendingReqsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setWorkspaceTab('event_budgets')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[40px] ${
                workspaceTab === 'event_budgets'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar size={15} />
              <span>Event Budgets</span>
              {eventBudgets.filter(b => b.status === 'pending_approval').length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-400 text-slate-950 tabular-nums">
                  {eventBudgets.filter(b => b.status === 'pending_approval').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setWorkspaceTab('setup')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[40px] ${
                workspaceTab === 'setup'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Landmark size={15} />
              <span>Accounting Setup</span>
            </button>

            <button
              onClick={() => setWorkspaceTab('gateways')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[40px] ${
                workspaceTab === 'gateways'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders size={15} />
              <span>Payment Channels</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center pt-1">
            <button
              onClick={() => setWorkspaceTab('requisitions')}
              className="px-4 py-2.5 rounded-xl text-xs font-black bg-slate-900 text-white inline-flex items-center gap-2"
            >
              <ShoppingCart size={15} /> Requisition Approvals
            </button>
          </div>
        )}
      </div>

      {(workspaceTab === 'ledger' || workspaceTab === 'documents' || workspaceTab === 'setup' || workspaceTab === 'transfers' || workspaceTab === 'gateways') && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label htmlFor="finance-configuration-scope" className="block text-xs font-black uppercase tracking-wide text-slate-700">
                Finance organizational scope
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Only church, district and branch scopes authorized by your authenticated Supabase account are listed here.
              </p>
            </div>
            <select
              id="finance-configuration-scope"
              aria-label="Finance configuration scope"
              value={selectedFinanceScope ? `${selectedFinanceScope.type}:${selectedFinanceScope.id ?? 'church'}` : ''}
              onChange={event => {
                const selected = availableFinanceScopes.find(item =>
                  `${item.scope_type}:${item.scope_id ?? 'church'}` === event.target.value);
                requestFinanceScopeChange(selected
                  ? { type: selected.scope_type, id: selected.scope_id } as FinanceOwnershipScope
                  : null);
              }}
              disabled={financeScopeLoading || availableFinanceScopes.length <= 1}
              className="min-h-[40px] w-full sm:w-auto sm:min-w-64 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-900 disabled:bg-slate-50 disabled:opacity-70"
            >
              {availableFinanceScopes.map(item => (
                <option key={`${item.scope_type}:${item.scope_id ?? 'church'}`} value={`${item.scope_type}:${item.scope_id ?? 'church'}`}>
                  {item.scope_type === 'church' ? 'Church-wide' : `${item.scope_type === 'district' ? 'District' : 'Branch'} — ${item.scope_name}`}
                </option>
              ))}
            </select>
          </div>
          {pendingScopeSwitch && (
            <div
              role="alert"
              className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-semibold">
                You have unsaved Accounting Setup changes in this scope. Discard them and switch scope?
              </span>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPendingScopeSwitch(null)}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Stay &amp; save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = pendingScopeSwitch;
                    setPendingScopeSwitch(null);
                    setSetupHasUnsavedChanges(false);
                    setSelectedFinanceScope(target);
                  }}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-950 cursor-pointer"
                >
                  Discard &amp; switch
                </button>
              </div>
            </div>
          )}
          {financeScopeLoading && <p className="mt-2 text-xs text-slate-500">Loading authorized finance scopes…</p>}
          {financeScopeError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{financeScopeError}</p>}
        </div>
      )}

      {/* --- WORKSPACE TAB: FINANCIAL DOCUMENTS & APPROVALS --- */}
      {workspaceTab === 'documents' && (
        <div className="space-y-6">
          {selectedFinanceScope ? (
            <FinanceDocumentWorkflowWorkspace
              branchId={selectedFinanceScope.type === 'branch' ? selectedFinanceScope.id : null}
              scope={selectedFinanceScope}
              scopeOptions={availableFinanceScopes}
              canApproveFinances={canApproveFinances}
              canCreateTransactions={canCreateScopedTransactions}
              canPostJournals={canPostJournals}
              memberProfiles={membersList}
              crossModuleQueues={{
                pendingRequisitions: requisitions.filter(r => r.status === 'pending_approval').length,
                pendingEventBudgets: eventBudgets.filter(b => b.status === 'pending_approval').length,
                onOpenRequisitions: () => setWorkspaceTab('requisitions'),
                onOpenEventBudgets: () => setWorkspaceTab('event_budgets'),
                onOpenTransfers: () => setWorkspaceTab('transfers'),
                onOpenJournalRegister: () => setWorkspaceTab('ledger')
              }}
              onResubmitDocument={handleResubmitRejectedDocument}
              onPendingCountChange={setPendingDocsCount}
            />
          ) : !financeScopeLoading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              Canonical financial documents and approvals are unavailable until an authorized organizational scope is confirmed by Supabase.
            </div>
          ) : null}
        </div>
      )}

      {/* --- WORKSPACE TAB 1: FINANCIAL LEDGER & REPORTS --- */}
      {workspaceTab === 'ledger' && (
        <div className="space-y-6">
          {selectedFinanceScope ? (
            <>
              {canCreateScopedTransactions && (
                <FinanceTransactionEntryWorkspace
                  branchId={selectedFinanceScope.type === 'branch' ? selectedFinanceScope.id : null}
                  scope={selectedFinanceScope}
                  prefillDraft={prefillTransactionDraft}
                  onClearPrefill={() => setPrefillTransactionDraft(null)}
                  onOpenAccountingSetup={handleOpenAccountingSetup}
                  canOpenChurchScopeSetup={canOpenChurchScopeSetup}
                  onOpenDocumentsTab={() => setWorkspaceTab('documents')}
                />
              )}
              <FinanceJournalWorkspace
                branchId={selectedFinanceScope.type === 'branch' ? selectedFinanceScope.id : null}
                scope={selectedFinanceScope}
                scopeOptions={availableFinanceScopes}
              />
            </>
          ) : !financeScopeLoading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              Canonical transactions, approvals and journal balances are unavailable until an authorized organizational scope is confirmed by Supabase.
            </div>
          ) : null}

          {/* Legacy Financial Records Archive (Collapsible Informational Reference) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Legacy financial records — informational only
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {records.length} historical record{records.length === 1 ? '' : 's'} · Excluded from official CSV/PDF reports and posted ledger balances.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLegacyArchive(prev => !prev)}
                aria-expanded={showLegacyArchive}
                className="inline-flex min-h-[38px] items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shrink-0 cursor-pointer"
              >
                {showLegacyArchive ? 'Hide legacy archive' : `View legacy archive (${records.length})`}
              </button>
            </div>

            {showLegacyArchive && (
              <div className="space-y-4 border-t border-slate-200 pt-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <strong>Informational archive only.</strong> These historical records are not canonical financial documents or posted journal entries and do not affect posted ledger balances.
                </div>

                {/* Filter Controls */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 max-w-xs sm:max-w-sm">
                      <label htmlFor="legacy-period-filter" className="text-xs font-extrabold text-slate-600 uppercase tracking-wider shrink-0">
                        Period:
                      </label>
                      <select
                        id="legacy-period-filter"
                        value={periodFilter}
                        onChange={(e) => setPeriodFilter(e.target.value as any)}
                        className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-slate-900 cursor-pointer"
                      >
                        <option value="all">All-Time</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="quarter">This Quarter</option>
                        <option value="year">This Year</option>
                      </select>
                    </div>
                    <span className="text-xs font-medium text-slate-500 tabular-nums">
                      Showing {filteredRecords.length} of {records.length} records
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search contributor, payee, txn ref..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-900"
                      />
                    </div>

                    <select
                      aria-label="Filter legacy record type"
                      value={typeFilter}
                      onChange={e => setTypeFilter(e.target.value as any)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-slate-900 cursor-pointer"
                    >
                      <option value="all">Type: Revenue &amp; Expenses</option>
                      <option value="income">Type: Revenue (Income)</option>
                      <option value="expense">Type: Expenditures (Expenses)</option>
                    </select>

                    <select
                      aria-label="Filter legacy record status"
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value as any)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-slate-900 cursor-pointer"
                    >
                      <option value="all">Status: All Statuses</option>
                      <option value="pending_verification">Pending Verification</option>
                      <option value="completed">Completed / Verified</option>
                      <option value="rejected">Rejected / Flagged</option>
                    </select>

                    <select
                      aria-label="Filter legacy record category"
                      value={selectedCategoryFilter}
                      onChange={e => setSelectedCategoryFilter(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-slate-900 cursor-pointer"
                    >
                      <option value="all">Category: All Categories</option>
                      {legacyCategoryOptions.map(category => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Mobile Cards */}
                <div className="block lg:hidden space-y-2.5">
                  {loading ? (
                    <div className="p-6 text-center text-slate-500 text-xs font-semibold bg-slate-50 rounded-xl border border-slate-200">
                      Loading financial records...
                    </div>
                  ) : filteredRecords.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-xs font-semibold bg-slate-50 rounded-xl border border-slate-200">
                      No transactions match the selected filters.
                    </div>
                  ) : (
                    filteredRecords.map(r => {
                      const isExpense = r.type === 'expense';
                      return (
                        <div key={r.id} className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm leading-snug">{r.contributor_name}</h4>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5 tabular-nums">
                                {new Date(r.date).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`font-black text-sm font-mono tabular-nums ${isExpense ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {isExpense ? '-' : '+'}{r.currency || 'SLE'} {Number(r.amount).toLocaleString()}
                              </div>
                              <span
                                className={`inline-block mt-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${
                                  r.status === 'completed' || !r.status
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : r.status === 'pending_verification'
                                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                                      : 'border-rose-200 bg-rose-50 text-rose-800'
                                }`}
                              >
                                {r.status === 'pending_verification' ? 'Pending Audit' : r.status || 'Verified'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
                            <span className={`font-bold ${isExpense ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {isExpense ? 'Expense' : 'Revenue'}
                            </span>
                            <span>·</span>
                            <span className="font-semibold text-slate-800">{r.category}</span>
                            <span>·</span>
                            <span className="capitalize">{r.payment_method.replace('_', ' ')}</span>
                          </div>

                          {r.notes && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                              {r.notes}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                            <div className="text-[11px] font-mono text-slate-500 truncate">
                              {r.transaction_id && <span>Ref: <strong className="text-slate-800">{r.transaction_id}</strong></span>}
                              {r.payment_proof_ref && <span className="ml-2 text-emerald-700 font-semibold">· Proof attached</span>}
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowPrintModal(r)}
                              title="Print Official Receipt/Voucher"
                              className="min-h-[38px] px-3 py-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                            >
                              <Printer size={14} />
                              <span>Print</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Desktop Table */}
                <div className="hidden lg:block rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                        <tr>
                          <th className="px-4 py-3">Contributor / Payee</th>
                          <th className="px-4 py-3">Type &amp; Category</th>
                          <th className="px-4 py-3">Payment Method &amp; Ref</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loading ? (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-slate-500 font-semibold">
                              Loading financial records...
                            </td>
                          </tr>
                        ) : filteredRecords.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-slate-500 font-semibold">
                              No transactions match the selected filters.
                            </td>
                          </tr>
                        ) : (
                          filteredRecords.map(r => {
                            const isExpense = r.type === 'expense';
                            return (
                              <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-bold text-slate-900 text-sm">{r.contributor_name}</div>
                                  <div className="text-[11px] text-slate-500 font-mono mt-0.5 tabular-nums">
                                    {new Date(r.date).toLocaleString()}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-bold uppercase text-[10px] ${isExpense ? 'text-rose-700' : 'text-emerald-700'}`}>
                                      {isExpense ? 'Expense' : 'Revenue'}
                                    </span>
                                    <span className="text-slate-400">·</span>
                                    <span className="font-semibold text-slate-800">{r.category}</span>
                                  </div>
                                  {r.notes && <p className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">{r.notes}</p>}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-semibold text-slate-800 capitalize">
                                    {r.payment_method.replace('_', ' ')}
                                  </div>
                                  {r.transaction_id && (
                                    <div className="font-mono text-[11px] text-slate-600">Ref: {r.transaction_id}</div>
                                  )}
                                  {r.payment_proof_ref && (
                                    <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                                      <FileText size={11} /> Proof: {r.payment_proof_ref}
                                    </div>
                                  )}
                                </td>
                                <td className={`px-4 py-3 text-right font-black text-sm tabular-nums ${isExpense ? 'text-rose-700' : 'text-emerald-700'}`}>
                                  {isExpense ? '-' : '+'}{r.currency || 'SLE'} {Number(r.amount).toLocaleString()}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${
                                      r.status === 'completed' || !r.status
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                        : r.status === 'pending_verification'
                                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                                          : 'border-rose-200 bg-rose-50 text-rose-800'
                                    }`}
                                  >
                                    {r.status === 'pending_verification' ? 'Pending Audit' : r.status || 'Verified'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setShowPrintModal(r)}
                                    title="Print Official Receipt/Voucher"
                                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                  >
                                    <Printer size={14} />
                                    <span>Print</span>
                                  </button>
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
            )}
          </section>
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>
                Internal transfers are managed from a branch finance scope. Select a branch scope to create, review or approve transfers.
              </span>
              {availableFinanceScopes.find(item => item.scope_type === 'branch') && (
                <button
                  type="button"
                  onClick={() => {
                    const branchScope = availableFinanceScopes.find(item => item.scope_type === 'branch');
                    if (branchScope) {
                      setSelectedFinanceScope({ type: 'branch', id: branchScope.scope_id } as FinanceOwnershipScope);
                    }
                  }}
                  className="inline-flex min-h-[38px] items-center justify-center whitespace-nowrap rounded-lg bg-amber-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-950 shrink-0 cursor-pointer"
                >
                  Switch to branch scope
                </button>
              )}
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
              hasChurchScope={availableFinanceScopes.some(item => item.scope_type === 'church')}
              onSwitchToChurchScope={() =>
                requestFinanceScopeChange({ type: 'church', id: null })
              }
              onUnsavedChangesChange={setSetupHasUnsavedChanges}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              Finance configuration is unavailable until an authorized scope can be confirmed by Supabase.
            </div>
          )}
        </section>
      )}

      {workspaceTab === 'requisitions' && (
        <DepartmentRequisitionWorkspace
          branchId={financeBranchId}
          actorProfileId={databaseProfileId}
          canApproveRequisitions={canApproveRequisitions}
          canManageFinances={hasEffectivePermission(financePermissions, 'manage_finances')}
          memberProfiles={membersList}
          requisitions={requisitions}
          requisitionError={requisitionError}
          onReloadRequisitions={reloadRequisitions}
          onOpenApprovalsTab={canViewFinance ? () => setWorkspaceTab('documents') : undefined}
          scopeName={
            availableFinanceScopes.find(
              item =>
                item.scope_type === selectedFinanceScope?.type &&
                item.scope_id === selectedFinanceScope?.id
            )?.scope_name
          }
        />
      )}

      {/* --- WORKSPACE TAB: VERIFIED PAYMENT CHANNELS --- */}
      {workspaceTab === 'gateways' && (
        <section className="space-y-4">
          {selectedFinanceScope ? (
            <PaymentChannelsWorkspace
              scope={selectedFinanceScope}
              scopeLabel={
                availableFinanceScopes.find(
                  item =>
                    item.scope_type === selectedFinanceScope.type &&
                    item.scope_id === selectedFinanceScope.id
                )?.scope_name ||
                (selectedFinanceScope.type === 'church' ? 'Church-wide' : undefined)
              }
              canManageFinances={canCreateScopedTransactions}
              onOpenAccountingSetup={() => setWorkspaceTab('setup')}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              Payment channel settings are unavailable until an authorized scope can be confirmed by Supabase.
            </div>
          )}
        </section>
      )}

      {workspaceTab === 'event_budgets' && (
        <EventBudgetFinanceWorkspace branchId={financeBranchId} profileId={databaseProfileId || null} />
      )}

      {/* MOBILE & TABLET MORE DRAWER (Overflow tabs + quick actions) */}
      {showMobileMoreMenu && canViewFinance && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-[45] bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setShowMobileMoreMenu(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More finance console sections"
            className="lg:hidden fixed bottom-[76px] inset-x-3 z-[55] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-sm font-black text-slate-900">More Finance Sections</h3>
                <p className="text-[11px] text-slate-500">Additional configuration and quick actions</p>
              </div>
              <button
                type="button"
                aria-label="Close more menu"
                onClick={() => setShowMobileMoreMenu(false)}
                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setWorkspaceTab('event_budgets')}
                className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left transition-colors cursor-pointer ${
                  workspaceTab === 'event_budgets'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Calendar size={18} className="shrink-0" />
                  <div>
                    <div className="text-xs font-bold">Event Budgets</div>
                    <div className={`text-[11px] ${workspaceTab === 'event_budgets' ? 'text-slate-300' : 'text-slate-500'}`}>
                      Event budget approvals &amp; disbursements
                    </div>
                  </div>
                </div>
                {eventBudgets.filter(b => b.status === 'pending_approval').length > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-400 text-slate-950 tabular-nums shrink-0">
                    {eventBudgets.filter(b => b.status === 'pending_approval').length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setWorkspaceTab('gateways')}
                className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left transition-colors cursor-pointer ${
                  workspaceTab === 'gateways'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Sliders size={18} className="shrink-0" />
                  <div>
                    <div className="text-xs font-bold">Payment Channels</div>
                    <div className={`text-[11px] ${workspaceTab === 'gateways' ? 'text-slate-300' : 'text-slate-500'}`}>
                      Verified mobile-money &amp; bank giving channels
                    </div>
                  </div>
                </div>
              </button>
            </div>

            <div className="border-t border-slate-100 pt-2.5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick Actions</p>
              <button
                type="button"
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  openPostedReportsSection();
                }}
                className="w-full inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
              >
                <Printer size={14} /> Open Posted Reports
              </button>
            </div>
          </div>
        </>
      )}

      {/* MOBILE & TABLET BOTTOM NAV BAR (5 Fixed Primary Tabs + Three-Dot More Button = 6 items on < lg screens) */}
      <nav
        aria-label="Mobile finance navigation"
        className="block lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 shadow-2xl px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
      >
        {canViewFinance ? (
          <div className="grid grid-cols-6 gap-0.5 sm:gap-1 max-w-2xl mx-auto">
            {/* Slot 1: Ledger */}
            <button
              type="button"
              onClick={() => setWorkspaceTab('ledger')}
              aria-current={workspaceTab === 'ledger' ? 'page' : undefined}
              className={`min-w-0 flex flex-col items-center justify-center min-h-[54px] py-1.5 px-0.5 sm:px-1 rounded-xl text-[9px] sm:text-[10px] leading-tight font-bold transition-colors cursor-pointer ${
                workspaceTab === 'ledger'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="relative inline-flex items-center justify-center shrink-0">
                <PieChart size={18} />
              </span>
              <span className="mt-1 truncate w-full text-center">Ledger</span>
            </button>

            {/* Slot 2: Documents & Approvals */}
            <button
              type="button"
              onClick={() => setWorkspaceTab('documents')}
              aria-current={workspaceTab === 'documents' ? 'page' : undefined}
              className={`min-w-0 flex flex-col items-center justify-center min-h-[54px] py-1.5 px-0.5 sm:px-1 rounded-xl text-[9px] sm:text-[10px] leading-tight font-bold transition-colors cursor-pointer ${
                workspaceTab === 'documents'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="relative inline-flex items-center justify-center shrink-0">
                <ShieldCheck size={18} />
                {pendingDocsCount > 0 && (
                  <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-amber-400" />
                )}
              </span>
              <span className="mt-1 truncate w-full text-center">Approvals</span>
            </button>

            {/* Slot 3: Internal Transfers */}
            <button
              type="button"
              onClick={() => setWorkspaceTab('transfers')}
              aria-current={workspaceTab === 'transfers' ? 'page' : undefined}
              className={`min-w-0 flex flex-col items-center justify-center min-h-[54px] py-1.5 px-0.5 sm:px-1 rounded-xl text-[9px] sm:text-[10px] leading-tight font-bold transition-colors cursor-pointer ${
                workspaceTab === 'transfers'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="relative inline-flex items-center justify-center shrink-0">
                <ArrowRightLeft size={18} />
              </span>
              <span className="mt-1 truncate w-full text-center">Transfers</span>
            </button>

            {/* Slot 4: Ministry Proposals */}
            <button
              type="button"
              onClick={() => setWorkspaceTab('requisitions')}
              aria-current={workspaceTab === 'requisitions' ? 'page' : undefined}
              className={`min-w-0 flex flex-col items-center justify-center min-h-[54px] py-1.5 px-0.5 sm:px-1 rounded-xl text-[9px] sm:text-[10px] leading-tight font-bold transition-colors cursor-pointer ${
                workspaceTab === 'requisitions'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="relative inline-flex items-center justify-center shrink-0">
                <ShoppingCart size={18} />
                {pendingReqsCount > 0 && (
                  <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-amber-400" />
                )}
              </span>
              <span className="mt-1 truncate w-full text-center">Proposals</span>
            </button>

            {/* Slot 5: Accounting Setup */}
            <button
              type="button"
              onClick={() => setWorkspaceTab('setup')}
              aria-current={workspaceTab === 'setup' ? 'page' : undefined}
              className={`min-w-0 flex flex-col items-center justify-center min-h-[54px] py-1.5 px-0.5 sm:px-1 rounded-xl text-[9px] sm:text-[10px] leading-tight font-bold transition-colors cursor-pointer ${
                workspaceTab === 'setup'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="relative inline-flex items-center justify-center shrink-0">
                <Landmark size={18} />
              </span>
              <span className="mt-1 truncate w-full text-center">Setup</span>
            </button>

            {/* Slot 6: Three-dot More Button */}
            <button
              type="button"
              aria-label="More finance sections"
              aria-expanded={showMobileMoreMenu}
              onClick={() => setShowMobileMoreMenu(prev => !prev)}
              className={`min-w-0 flex flex-col items-center justify-center min-h-[54px] py-1.5 px-0.5 sm:px-1 rounded-xl text-[9px] sm:text-[10px] leading-tight font-bold transition-colors cursor-pointer ${
                showMobileMoreMenu ||
                workspaceTab === 'event_budgets' ||
                workspaceTab === 'gateways'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="relative inline-flex items-center justify-center shrink-0">
                <MoreHorizontal size={18} />
                {eventBudgets.filter(b => b.status === 'pending_approval').length > 0 && (
                  <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-amber-400" />
                )}
              </span>
              <span className="mt-1 truncate w-full text-center">More</span>
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => setWorkspaceTab('requisitions')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-extrabold bg-indigo-600 text-white"
            >
              <ShoppingCart size={18} /> Requisition Approvals
            </button>
          </div>
        )}
      </nav>
      {/* Legacy Financial Record Print / Voucher Modal */}
      {showPrintModal && (
        <div
          className="finance-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Legacy financial record voucher"
        >
          <div className="finance-detail-panel">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 print:hidden">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Legacy record voucher</p>
                <h3 className="text-lg font-black text-slate-900">
                  {showPrintModal.type === 'expense' ? 'LEGACY PAYMENT RECORD' : 'LEGACY RECEIPT RECORD'}
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
                  aria-label="Close legacy voucher"
                  onClick={() => setShowPrintModal(null)}
                  className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="finance-print-sheet pt-4 space-y-5">
              <div className="border-b-2 border-slate-900 pb-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  {churchProfile.name} · Informational Archive Copy
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">
                  {showPrintModal.type === 'expense' ? 'HISTORICAL EXPENSE RECORD' : 'HISTORICAL RECEIPT RECORD'}
                </h2>
                <p className="mt-1 font-mono text-xs text-slate-600">
                  Record ID: {showPrintModal.id}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs uppercase text-slate-500">
                    {showPrintModal.type === 'expense' ? 'Paid to' : 'Contributor'}
                  </p>
                  <p className="mt-1 font-bold text-slate-900">{showPrintModal.contributor_name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Date</p>
                  <p className="mt-1 font-bold tabular-nums text-slate-900">
                    {new Date(showPrintModal.date).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Amount</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                    {showPrintModal.currency || 'SLE'} {Number(showPrintModal.amount).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Category &amp; Method</p>
                  <p className="mt-1 font-bold text-slate-900 capitalize">
                    {showPrintModal.category} · {showPrintModal.payment_method.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Reference</p>
                  <p className="mt-1 font-mono font-bold text-slate-900">
                    {showPrintModal.transaction_id || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Status</p>
                  <p className="mt-1 font-bold capitalize text-slate-900">
                    {showPrintModal.status || 'verified'}
                  </p>
                </div>
              </div>

              {showPrintModal.notes && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs uppercase text-slate-500">Notes</p>
                  <p className="mt-1 text-sm text-slate-800">{showPrintModal.notes}</p>
                </div>
              )}

              <p className="text-center text-[10px] text-slate-400">
                This informational copy is from the legacy archive and is not a canonical posted journal entry.
              </p>
            </div>
          </div>
        </div>
      )}
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

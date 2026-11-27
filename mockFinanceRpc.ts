export type MockFinanceDocumentType = 'receipt' | 'payment';
export type MockFinanceDecision = 'approved' | 'rejected';

export interface MockFinanceState {
  profiles: Array<{ id: string; auth_user_id: string | null; status?: string; branch_id?: string | null; first_name?: string; last_name?: string; membership_status?: string; record_status?: string }>;
  ministries: Array<{ id: string; branch_id: string | null; name: string; entity_type: string; status: string }>;
  requisitions: Array<Record<string, any>>;
  requisitionItems: Array<Record<string, any>>;
  permissions: Array<{ profile_id: string; permission: string; branch_id: string | null; district_id?: string | null }>;
  branches: Array<{ id: string; district_id: string | null; name?: string; code?: string; status?: string }>;
  districts: Array<{ id: string; name: string; status?: string }>;
  currencies: string[];
  baseCurrencyCode: string | null;
  financialAccounts: Array<{ id: string; branch_id: string | null; district_id?: string | null; currency_code: string; is_active: boolean; chart_account_id: string; [key: string]: any }>;
  chartAccounts: Array<{ id: string; is_active: boolean; account_type: string; is_control_account?: boolean; [key: string]: any }>;
  funds: Array<{ id: string; is_active: boolean; branch_id?: string | null; district_id?: string | null; [key: string]: any }>;
  paymentChannels: Array<Record<string, any>>;
  periods: Array<{ id: string; start_date: string; end_date: string; status: string; year_status: string; [key: string]: any }>;
  financialYears: Array<Record<string, any>>;
  approvalPolicyBands: Array<Record<string, any>>;
  approvalPolicySteps: Array<Record<string, any>>;
  events: Array<{ id: string; branch_id: string; name?: string; title?: string; [key: string]: any }>;
  budgets: Array<Record<string, any>>;
  budgetLines: Array<Record<string, any>>;
  approvalPolicies: Array<{
    id: string; is_active: boolean; transaction_type: 'financial_document' | 'budget' | 'requisition' | 'financial_transfer';
    branch_id: string | null; district_id?: string | null; min_amount: number; max_amount: number | null;
    approver_profile_ids: string[]; [key: string]: any;
  }>;
  documents: Array<Record<string, any>>;
  transfers: Array<Record<string, any>>;
  branchClearingAccounts: Array<Record<string, any>>;
  journals: Array<Record<string, any>>;
  journalLines: Array<Record<string, any>>;
  approvalRequests: Array<Record<string, any>>;
  approvalSteps: Array<Record<string, any>>;
  approvalDecisions: Array<Record<string, any>>;
  nextId: number;
}

export interface MockFinanceStorage {
  load(): MockFinanceState;
  save(state: MockFinanceState): void;
}

export interface MockFinanceAuth {
  userId: string | null;
}

export interface MockFinanceKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MOCK_FINANCE_STORAGE_KEY = 'scms_mock_finance_v2';

/** Browser persistence is namespaced and versioned; corrupt data fails closed. */
export function createBrowserMockFinanceStorage(
  storage: MockFinanceKeyValueStorage,
  key = MOCK_FINANCE_STORAGE_KEY
): MockFinanceStorage {
  return {
    load() {
      const raw = storage.getItem(key);
      if (!raw) return createEmptyMockFinanceState();
      const parsed = JSON.parse(raw) as MockFinanceState;
      const requiredArrays = ['profiles', 'permissions', 'currencies', 'financialAccounts', 'chartAccounts',
        'funds', 'periods', 'financialYears', 'approvalPolicyBands', 'approvalPolicySteps', 'approvalPolicies', 'documents', 'journals', 'journalLines',
        'approvalRequests', 'approvalSteps'];
      if (!parsed || typeof parsed !== 'object' || requiredArrays.some(name => !Array.isArray((parsed as any)[name])) ||
          typeof parsed.nextId !== 'number' || !Number.isInteger(parsed.nextId) || parsed.nextId < 1) {
        throw new Error('Stored mock finance data is invalid; reset the mock finance store before continuing.');
      }
      parsed.approvalDecisions = Array.isArray(parsed.approvalDecisions) ? parsed.approvalDecisions : [];
      parsed.transfers = Array.isArray(parsed.transfers) ? parsed.transfers : [];
      parsed.branchClearingAccounts = Array.isArray(parsed.branchClearingAccounts) ? parsed.branchClearingAccounts : [];
      parsed.branches = Array.isArray(parsed.branches) ? parsed.branches : [];
      parsed.districts = Array.isArray(parsed.districts) ? parsed.districts : [];
      parsed.ministries = Array.isArray(parsed.ministries) ? parsed.ministries : [];
      parsed.requisitions = Array.isArray(parsed.requisitions) ? parsed.requisitions : [];
      parsed.requisitionItems = Array.isArray(parsed.requisitionItems) ? parsed.requisitionItems : [];
      parsed.events = Array.isArray(parsed.events) ? parsed.events : [];
      parsed.budgets = Array.isArray(parsed.budgets) ? parsed.budgets : [];
      parsed.budgetLines = Array.isArray(parsed.budgetLines) ? parsed.budgetLines : [];
      parsed.paymentChannels = Array.isArray(parsed.paymentChannels) ? parsed.paymentChannels : [];
      return parsed;
    },
    save(state) { storage.setItem(key, JSON.stringify(state)); }
  };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (message: string, code = '22023') => ({ data: null, error: { code, message } });
const success = <T>(data: T) => ({ data, error: null });
const round4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;
const isValidIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
};

/** Expand every effective role permission across its resolved branch scope.
 * The adapter consumes the same permission catalog as the role editor; keeping
 * this unfiltered prevents newly introduced scoped permissions from silently
 * disappearing at the mock RPC boundary.
 */
export function expandMockFinancePermissions(
  profileId: string,
  permissionKeys: string[],
  branchIds: Array<string | null>
): Array<{ profile_id: string; permission: string; branch_id: string | null }> {
  return [...new Set(permissionKeys)].flatMap(permission =>
    [...new Set(branchIds)].map(branch_id => ({ profile_id: profileId, permission, branch_id }))
  );
}

export function createEmptyMockFinanceState(): MockFinanceState {
  return {
    profiles: [], permissions: [], branches: [], districts: [], ministries: [], requisitions: [], requisitionItems: [], currencies: [], baseCurrencyCode: null,
    financialAccounts: [], chartAccounts: [], funds: [], paymentChannels: [], periods: [], financialYears: [],
    approvalPolicyBands: [], approvalPolicySteps: [], approvalPolicies: [], events: [], budgets: [], budgetLines: [],
    documents: [], transfers: [], branchClearingAccounts: [], journals: [], journalLines: [], approvalRequests: [], approvalSteps: [], approvalDecisions: [], nextId: 1
  };
}

/**
 * Deterministic, isolated implementation of canonical finance configuration,
 * document, approval, journal-posting and ledger-read RPCs. State is committed
 * only after a complete operation succeeds; legacy FinancialRecord data is
 * never read or modified.
 */
export function createMockFinanceRpc(
  storage: MockFinanceStorage,
  getAuth: () => MockFinanceAuth
) {
  const id = (state: MockFinanceState, prefix: string) => `${prefix}-${state.nextId++}`;
  const hasPermission = (state: MockFinanceState, profileId: string, permission: string, branchId: string | null) => {
    const branchDistrictId = branchId
      ? state.branches.find(branch => branch.id === branchId)?.district_id ?? null
      : null;
    return state.permissions.some(p => p.profile_id === profileId && p.permission === permission &&
      ((p.district_id == null && (p.branch_id === null || p.branch_id === branchId)) ||
       (branchDistrictId !== null && p.district_id === branchDistrictId)));
  };
  const hasDistrictPermission = (state: MockFinanceState, profileId: string, permission: string, districtId: string) => {
    return state.permissions.some(p => p.profile_id === profileId && p.permission === permission &&
      ((p.branch_id == null && p.district_id == null) || p.district_id === districtId));
  };
  const hasScopePermission = (
    state: MockFinanceState,
    profileId: string,
    permission: string,
    branchId: string | null,
    districtId: string | null
  ) => {
    if (branchId) return hasPermission(state, profileId, permission, branchId);
    if (districtId) return hasDistrictPermission(state, profileId, permission, districtId);
    return hasPermission(state, profileId, permission, null);
  };
  const matchesHierarchicalScope = (
    item: { branch_id?: string | null; district_id?: string | null },
    scopeType: string,
    branchId: string | null,
    districtId: string | null
  ) => {
    const itemBranch = item.branch_id ?? null;
    const itemDistrict = item.district_id ?? null;
    if (scopeType === 'branch') {
      return itemBranch === branchId || (itemBranch === null && (itemDistrict === null || itemDistrict === districtId));
    }
    if (scopeType === 'district') {
      return itemBranch === null && (itemDistrict === districtId || itemDistrict === null);
    }
    return itemBranch === null && itemDistrict === null;
  };
  const matchesExactScope = (
    item: { branch_id?: string | null; district_id?: string | null },
    scopeType: string,
    branchId: string | null,
    districtId: string | null
  ) => {
    const itemBranch = item.branch_id ?? null;
    const itemDistrict = item.district_id ?? null;
    if (scopeType === 'branch') return itemBranch === branchId;
    if (scopeType === 'district') return itemBranch === null && itemDistrict === districtId;
    return itemBranch === null && itemDistrict === null;
  };

  function createScopedTransaction(
    args: Record<string, any>,
    includeScopeMetadata = false,
    stateOverride?: MockFinanceState,
    persist = true
  ) {
    const state = stateOverride ?? clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const scopeType = String(args.p_scope_type ?? (args.p_branch_id ? 'branch' : 'church'));
    const scopeId: string | null = args.p_scope_id !== undefined ? (args.p_scope_id ?? null) : (args.p_branch_id ?? null);
    if (!['church', 'district', 'branch'].includes(scopeType)) {
      return fail('Finance scope must be church, district or branch');
    }
    let branchId: string | null = null;
    let districtId: string | null = null;
    if (scopeType === 'church') {
      if (scopeId !== null) return fail('Church-wide finance scope must not include a scope ID');
      if (!hasPermission(state, actor.id, 'manage_finances', null)) {
        return fail('Insufficient permission to create church-wide financial transactions', '42501');
      }
    } else if (scopeType === 'district') {
      if (!scopeId || !state.districts.some(d => d.id === scopeId && d.status !== 'inactive' && d.status !== 'archived')) {
        return fail('Finance district does not exist or is inactive');
      }
      if (!hasDistrictPermission(state, actor.id, 'manage_finances', scopeId)) {
        return fail('Insufficient permission to create financial transactions in this district', '42501');
      }
      districtId = scopeId;
    } else {
      if (!scopeId || !hasPermission(state, actor.id, 'manage_finances', scopeId)) {
        return fail('Insufficient permission to create financial transactions in this branch', '42501');
      }
      const branch = state.branches.find(b => b.id === scopeId && b.status !== 'inactive' && b.status !== 'archived');
      if (!branch && (includeScopeMetadata || state.branches.length > 0)) {
        return fail('Finance branch does not exist or is inactive');
      }
      branchId = scopeId;
      districtId = branch?.district_id ?? null;
    }

    const type = args.p_document_type as MockFinanceDocumentType;
    const idempotencyKey = String(args.p_idempotency_key || '').trim();
    if (!idempotencyKey) return fail('A transaction idempotency key is required');
    const requestFingerprint = JSON.stringify({
      ...(includeScopeMetadata ? { scope_type: scopeType, scope_id: scopeId } : { branch_id: branchId }),
      document_type: args.p_document_type,
      transaction_date: args.p_transaction_date,
      profile_id: args.p_profile_id ?? null,
      party_name: String(args.p_party_name || '').trim(),
      amount: Number(args.p_amount),
      currency_code: String(args.p_currency_code || '').trim().toUpperCase(),
      payment_method: args.p_payment_method,
      financial_account_id: args.p_financial_account_id,
      category_account_id: args.p_category_account_id,
      fund_id: args.p_fund_id ?? null,
      external_reference: String(args.p_external_reference || '').trim() || null,
      description: String(args.p_description || '').trim(),
      exchange_rate_to_base: Number(args.p_exchange_rate_to_base ?? 1)
    });
    const priorDocument = state.documents.find(document =>
      document.created_by_profile_id === actor.id && document.idempotency_key === idempotencyKey);
    if (priorDocument) {
      if (priorDocument.idempotency_fingerprint !== requestFingerprint) {
        return fail('This idempotency key was already used with different transaction details');
      }
      const priorJournal = state.journals.find(journal =>
        journal.source_id === priorDocument.id && ['financial_document', 'financial_document_pending'].includes(journal.source_type));
      return success({
        document_id: priorDocument.id,
        document_number: priorDocument.document_number ?? null,
        journal_entry_id: priorJournal?.id ?? priorDocument.journal_entry_id ?? null,
        approval_request_id: priorDocument.approval_request_id ?? null,
        status: priorDocument.status,
        ...(includeScopeMetadata ? { scope_type: scopeType, scope_id: scopeId, idempotent_replay: true } : {})
      });
    }
    const amount = Number(args.p_amount);
    const rate = Number(args.p_exchange_rate_to_base ?? 1);
    const date = args.p_transaction_date;
    const currency = String(args.p_currency_code || '').trim().toUpperCase();
    const party = String(args.p_party_name || '').trim();
    const description = String(args.p_description || '').trim();
    const method = args.p_payment_method;
    if (!['receipt', 'payment'].includes(type)) return fail('Only receipt and payment transactions can be created here');
    if (!isValidIsoDate(date) || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isFinite(rate) || rate <= 0) return fail('Transaction date, positive amount and positive exchange rate are required');
    if (currency.length !== 3 || !state.currencies.includes(currency)) return fail('A valid transaction currency is required');
    if (!party || !description) return fail('Counterparty name and description are required');
    if (!['cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other'].includes(method)) return fail('Unsupported payment method');
    if (!state.baseCurrencyCode) return fail('Church settings must be configured before financial operations');
    if (currency === state.baseCurrencyCode && rate !== 1) return fail('Exchange rate must be 1 for the base currency');
    if (args.p_profile_id && !state.profiles.some(p => p.id === args.p_profile_id)) return fail('Selected member profile does not exist');
    const financialAccount = state.financialAccounts.find(a => a.id === args.p_financial_account_id &&
      a.is_active && a.currency_code === currency && matchesHierarchicalScope(a, scopeType, branchId, districtId));
    if (!financialAccount) return fail('Financial account is inactive or incompatible with transaction scope/currency');
    const cashAccount = state.chartAccounts.find(a => a.id === financialAccount.chart_account_id && a.is_active && a.account_type === 'asset');
    if (!cashAccount) return fail('Financial account must link to an active asset chart account');
    const expectedCategory = type === 'receipt' ? 'income' : 'expense';
    const category = state.chartAccounts.find(a => a.id === args.p_category_account_id && a.is_active &&
      !a.is_control_account && a.account_type === expectedCategory);
    if (!category) return fail('Selected category must be an active, non-control account of the correct type');
    if (args.p_fund_id && !state.funds.some(f => f.id === args.p_fund_id && f.is_active &&
      matchesHierarchicalScope(f, scopeType, branchId, districtId))) {
      return fail('Selected fund is inactive or incompatible with this organizational scope');
    }
    const period = state.periods.find(p => p.status === 'open' && p.year_status === 'open' && date >= p.start_date && date <= p.end_date);
    if (!period) return fail('No open financial period and year exist for the transaction date');

    const baseAmount = round4(amount * rate);
    const policy = state.approvalPolicies
      .filter(p => p.is_active && p.transaction_type === 'financial_document' &&
        matchesHierarchicalScope(p, scopeType, branchId, districtId) &&
        (!p.effective_from || p.effective_from <= new Date().toISOString().slice(0, 10)) &&
        (!p.effective_to || p.effective_to >= new Date().toISOString().slice(0, 10)))
      .sort((a: any, b: any) => Number(b.branch_id != null) - Number(a.branch_id != null) ||
        Number(b.district_id != null) - Number(a.district_id != null) ||
        Number(b.version || 0) - Number(a.version || 0))[0];
    if (!policy) return fail('No active financial-document approval policy is configured for this scope');
    const selectedBand = state.approvalPolicyBands.find(b => b.policy_id === policy.id &&
      baseAmount >= Number(b.min_amount_base) &&
      (b.max_amount_base == null || baseAmount < Number(b.max_amount_base)));
    if (!selectedBand) return fail('No approval threshold band covers this transaction amount');
    const policySteps = state.approvalPolicySteps
      .filter(step => step.band_id === selectedBand.id)
      .sort((a, b) => Number(a.step_number) - Number(b.step_number));
    if (policySteps.some((step, index) => !Number.isInteger(Number(step.step_number)) ||
      Number(step.step_number) !== index + 1 || !step.required_permission_key ||
      !Number.isInteger(Number(step.required_approvals)) || Number(step.required_approvals) < 1)) {
      return fail('Approval policy steps are incomplete or incorrectly ordered');
    }

    const documentId = id(state, 'doc');
    const journalId = id(state, 'journal');
    const requestId = policySteps.length ? id(state, 'approval') : null;
    const docStatus = policySteps.length ? 'pending_approval' : 'approved';
    const documentNumber = state.documents.reduce((max, item) => Math.max(max, Number(item.document_number) || 0), 0) + 1;
    const linkedProfileId = args.p_profile_id ?? null;
    const document = {
      id: documentId, document_number: documentNumber, idempotency_key: idempotencyKey, idempotency_fingerprint: requestFingerprint,
      document_type: type, transaction_date: date, branch_id: branchId, district_id: districtId,
      profile_id: linkedProfileId, payee_or_payer_name: party, amount, currency_code: currency,
      payment_method: method, financial_account_id: financialAccount.id, fund_id: args.p_fund_id ?? null,
      external_reference: String(args.p_external_reference || '').trim() || null,
      description, status: docStatus, created_by_profile_id: actor.id, approval_request_id: requestId,
      exchange_rate_to_base: rate, base_currency_code: state.baseCurrencyCode,
      journal_entry_id: policySteps.length ? null : journalId
    };
    const journal = {
      id: journalId, period_id: period.id, branch_id: branchId, district_id: districtId, entry_date: date,
      description, reference: document.external_reference, currency_code: currency,
      exchange_rate_to_base: rate, base_currency_code: state.baseCurrencyCode,
      source_type: policySteps.length ? 'financial_document_pending' : 'financial_document',
      source_id: documentId, status: 'draft'
    };
    const debitAccount = type === 'receipt' ? cashAccount.id : category.id;
    const creditAccount = type === 'receipt' ? category.id : cashAccount.id;
    const lines = [
      { id: id(state, 'line'), journal_entry_id: journalId, line_number: 1, account_id: debitAccount,
        fund_id: type === 'payment' ? args.p_fund_id ?? null : null, branch_id: branchId,
        profile_id: linkedProfileId, description, debit_amount: amount, credit_amount: 0,
        base_debit_amount: baseAmount, base_credit_amount: 0 },
      { id: id(state, 'line'), journal_entry_id: journalId, line_number: 2, account_id: creditAccount,
        fund_id: type === 'receipt' ? args.p_fund_id ?? null : null, branch_id: branchId,
        profile_id: linkedProfileId, description, debit_amount: 0, credit_amount: amount,
        base_debit_amount: 0, base_credit_amount: baseAmount }
    ];
    if (requestId) {
      state.approvalRequests.push({
        id: requestId, transaction_type: 'financial_document', target_id: documentId,
        branch_id: branchId, district_id: districtId, status: 'pending', policy_id: policy.id,
        submitted_by_profile_id: actor.id, amount_base: baseAmount
      });
      state.approvalSteps.push(...policySteps.map(policyStep => ({
        id: id(state, 'step'), approval_request_id: requestId,
        step_order: Number(policyStep.step_number),
        required_permission_key: policyStep.required_permission_key,
        required_approvals: Number(policyStep.required_approvals),
        prohibit_submitter_approval: policyStep.prohibit_submitter_approval !== false,
        status: 'pending'
      })));
    }
    state.documents.push(document);
    state.journals.push(journal);
    state.journalLines.push(...lines);
    if (persist) storage.save(state);
    return success({
      document_id: documentId,
      document_number: documentNumber,
      journal_entry_id: journalId,
      approval_request_id: requestId,
      status: docStatus,
      ...(includeScopeMetadata ? { scope_type: scopeType, scope_id: scopeId, idempotent_replay: false } : {})
    });
  }

  function createTransaction(args: Record<string, any>, stateOverride?: MockFinanceState, persist = true) {
    return createScopedTransaction(
      {
        ...args,
        p_scope_type: args.p_branch_id ? 'branch' : 'church',
        p_scope_id: args.p_branch_id ?? null
      },
      false,
      stateOverride,
      persist
    );
  }

  function createFinanceScopeDocumentTransaction(args: Record<string, any>) {
    return createScopedTransaction(args, true);
  }


  function setFinanceBranchClearingAccounts(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = String(args.p_branch_id || '');
    if (!branchId || !hasPermission(state, actor.id, 'manage_finances', branchId)) {
      return fail('Insufficient permission to configure branch clearing accounts', '42501');
    }
    if (!state.branches.some(branch => branch.id === branchId && branch.status !== 'inactive' && branch.status !== 'archived')) {
      return fail('Branch does not exist or is inactive');
    }
    const dueFrom = state.chartAccounts.find(account =>
      account.id === args.p_due_from_chart_account_id && account.is_active && account.account_type === 'asset');
    const dueTo = state.chartAccounts.find(account =>
      account.id === args.p_due_to_chart_account_id && account.is_active && account.account_type === 'liability');
    if (!dueFrom || !dueTo || dueFrom.id === dueTo.id) {
      return fail('Distinct active due-from asset and due-to liability chart accounts are required');
    }
    const existing = state.branchClearingAccounts.find(item => item.branch_id === branchId);
    const record = {
      branch_id: branchId,
      due_from_chart_account_id: dueFrom.id,
      due_to_chart_account_id: dueTo.id,
      is_active: true,
      configured_by_profile_id: actor.id,
      updated_at: new Date().toISOString()
    };
    if (existing) Object.assign(existing, record);
    else state.branchClearingAccounts.push(record);
    storage.save(state);
    return success({ saved: true, branch_id: branchId });
  }


  function getFinanceBranchClearingAccounts(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = String(args.p_branch_id || '');
    if (!branchId || !(hasPermission(state, actor.id, 'view_finances', branchId) ||
      hasPermission(state, actor.id, 'manage_finances', branchId))) {
      return fail('Insufficient permission to view branch clearing-account configuration', '42501');
    }
    return success(clone(state.branchClearingAccounts.find(item => item.branch_id === branchId) ?? null));
  }

  function createTransferApprovalRequest(
    state: MockFinanceState,
    transferId: string,
    branchId: string,
    districtId: string | null,
    actorId: string,
    baseAmount: number
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const policy = state.approvalPolicies
      .filter(item => item.transaction_type === 'financial_transfer' && item.is_active &&
        item.branch_id === branchId && (item.district_id ?? null) === districtId &&
        (!item.effective_from || item.effective_from <= today) &&
        (!item.effective_to || item.effective_to >= today))
      .sort((a: any, b: any) => Number(b.version || 0) - Number(a.version || 0))[0];
    if (!policy) return { error: `No active financial-transfer approval policy is configured for branch ${branchId}` };
    const band = state.approvalPolicyBands.find(item => item.policy_id === policy.id &&
      baseAmount >= Number(item.min_amount_base) &&
      (item.max_amount_base == null || baseAmount < Number(item.max_amount_base)));
    if (!band) return { error: `No financial-transfer approval threshold band covers this amount for branch ${branchId}` };
    const policySteps = state.approvalPolicySteps
      .filter(item => item.band_id === band.id)
      .sort((a, b) => Number(a.step_number) - Number(b.step_number));
    if (policySteps.some((step, index) => Number(step.step_number) !== index + 1 ||
      !Number.isInteger(Number(step.required_approvals)) || Number(step.required_approvals) < 1 ||
      step.required_permission_key !== 'approve_finances')) {
      return { error: 'Financial-transfer approval policy steps are incomplete or incorrectly ordered' };
    }
    const requestId = id(state, 'approval');
    const request = {
      id: requestId, transaction_type: 'financial_transfer', target_id: transferId,
      branch_id: branchId, district_id: districtId,
      status: policySteps.length ? 'pending' : 'approved',
      policy_id: policy.id, policy_version: policy.version,
      band_id: band.id, amount_base: baseAmount,
      submitted_by_profile_id: actorId,
      completed_at: policySteps.length ? null : new Date().toISOString()
    };
    state.approvalRequests.push(request);
    state.approvalSteps.push(...policySteps.map(step => ({
      id: id(state, 'step'),
      approval_request_id: requestId,
      step_order: Number(step.step_number),
      required_permission_key: step.required_permission_key,
      required_approvals: Number(step.required_approvals),
      prohibit_submitter_approval: step.prohibit_submitter_approval !== false,
      status: 'pending'
    })));
    return { request, steps: policySteps };
  }

  function createFinancialTransfer(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const sourceBranchId = String(args.p_source_branch_id || '');
    const destinationBranchId = String(args.p_destination_branch_id || '');
    const sourceAccountId = String(args.p_source_financial_account_id || '');
    const destinationAccountId = String(args.p_destination_financial_account_id || '');
    const date = String(args.p_transaction_date || '');
    const amount = Number(args.p_amount);
    const currency = String(args.p_currency_code || '').trim().toUpperCase();
    const rate = Number(args.p_exchange_rate_to_base);
    const description = String(args.p_description || '').trim();
    const externalReference = String(args.p_external_reference || '').trim() || null;
    const idempotencyKey = String(args.p_idempotency_key || '').trim();
    if (!idempotencyKey) return fail('A transfer idempotency key is required');
    if (!sourceBranchId || !destinationBranchId || !sourceAccountId || !destinationAccountId ||
        sourceAccountId === destinationAccountId || !date || !isValidIsoDate(date) ||
        !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0 ||
        currency.length !== 3 || !state.currencies.includes(currency) || !description) {
      return fail('A valid transfer date, distinct branch-owned accounts, positive amount/rate, currency and description are required');
    }
    if (!state.baseCurrencyCode) return fail('Church settings must be configured before financial operations');
    if (currency === state.baseCurrencyCode && rate !== 1) return fail('Exchange rate must be 1 for the base currency');
    if (!hasPermission(state, actor.id, 'manage_finances', sourceBranchId) ||
        !hasPermission(state, actor.id, 'manage_finances', destinationBranchId)) {
      return fail('The transfer creator must have manage-finances permission in both affected branches', '42501');
    }
    const sourceBranch = state.branches.find(branch => branch.id === sourceBranchId && branch.status !== 'inactive' && branch.status !== 'archived');
    const destinationBranch = state.branches.find(branch => branch.id === destinationBranchId && branch.status !== 'inactive' && branch.status !== 'archived');
    if (!sourceBranch || !destinationBranch) return fail('Both transfer branches must exist and be active');
    const sourceDistrictId = sourceBranch.district_id ?? null;
    const destinationDistrictId = destinationBranch.district_id ?? null;
    const sourceAccount = state.financialAccounts.find(account =>
      account.id === sourceAccountId && account.is_active && account.branch_id === sourceBranchId && account.currency_code === currency);
    const destinationAccount = state.financialAccounts.find(account =>
      account.id === destinationAccountId && account.is_active && account.branch_id === destinationBranchId && account.currency_code === currency);
    if (!sourceAccount || !destinationAccount) return fail('Source and destination accounts must be active, branch-owned and use the same currency');
    const sourceChart = state.chartAccounts.find(account => account.id === sourceAccount.chart_account_id && account.is_active && account.account_type === 'asset');
    const destinationChart = state.chartAccounts.find(account => account.id === destinationAccount.chart_account_id && account.is_active && account.account_type === 'asset');
    if (!sourceChart || !destinationChart) return fail('Both financial accounts must map to active asset chart accounts');

    const fingerprint = JSON.stringify({
      transaction_date: date, source_branch_id: sourceBranchId, source_financial_account_id: sourceAccountId,
      destination_branch_id: destinationBranchId, destination_financial_account_id: destinationAccountId,
      amount, currency_code: currency, exchange_rate_to_base: rate, description, external_reference: externalReference
    });
    const prior = state.transfers.find(item => item.created_by_profile_id === actor.id && item.idempotency_key === idempotencyKey);
    if (prior) {
      if (prior.idempotency_fingerprint !== fingerprint) return fail('This transfer idempotency key was already used with different details');
      return success({
        transfer_id: prior.id, transfer_number: prior.transfer_number,
        source_approval_request_id: prior.source_approval_request_id,
        destination_approval_request_id: prior.destination_approval_request_id,
        source_journal_entry_id: prior.source_journal_entry_id,
        destination_journal_entry_id: prior.destination_journal_entry_id,
        status: prior.status, idempotent_replay: true
      });
    }

    const period = state.periods.find(item => item.status === 'open' && item.year_status === 'open' &&
      date >= item.start_date && date <= item.end_date);
    if (!period) return fail('No open financial period and year exist for the transfer date');
    const baseAmount = round4(amount * rate);
    let sourceClearing: Record<string, any> | undefined;
    let destinationClearing: Record<string, any> | undefined;
    let dueFrom: Record<string, any> | undefined;
    let dueTo: Record<string, any> | undefined;
    if (sourceBranchId !== destinationBranchId) {
      sourceClearing = state.branchClearingAccounts.find(item => item.branch_id === sourceBranchId && item.is_active);
      destinationClearing = state.branchClearingAccounts.find(item => item.branch_id === destinationBranchId && item.is_active);
      if (!sourceClearing || !destinationClearing) return fail('Configure active due-from and due-to clearing accounts for both branches first');
      dueFrom = state.chartAccounts.find(account => account.id === sourceClearing!.due_from_chart_account_id && account.is_active && account.account_type === 'asset');
      dueTo = state.chartAccounts.find(account => account.id === destinationClearing!.due_to_chart_account_id && account.is_active && account.account_type === 'liability');
      if (!dueFrom || !dueTo) return fail('Both branches require an active due-from asset and due-to liability clearing account');
    }

    const transferId = id(state, 'transfer');
    const sourceJournalId = id(state, 'journal');
    const destinationJournalId = sourceBranchId === destinationBranchId ? null : id(state, 'journal');
    const now = new Date().toISOString();
    const transferNumber = state.transfers.reduce((max, item) => Math.max(max, Number(item.transfer_number) || 0), 0) + 1;
    const transfer: Record<string, any> = {
      id: transferId, transfer_number: transferNumber, transaction_date: date,
      source_financial_account_id: sourceAccountId, destination_financial_account_id: destinationAccountId,
      source_branch_id: sourceBranchId, destination_branch_id: destinationBranchId,
      source_district_id: sourceDistrictId, destination_district_id: destinationDistrictId,
      amount, currency_code: currency, exchange_rate_to_base: rate,
      base_currency_code: state.baseCurrencyCode, external_reference: externalReference,
      description, status: 'pending_approval', created_by_profile_id: actor.id,
      idempotency_key: idempotencyKey, idempotency_fingerprint: fingerprint,
      source_approval_request_id: null, destination_approval_request_id: null,
      source_journal_entry_id: sourceJournalId, destination_journal_entry_id: destinationJournalId,
      created_at: now, updated_at: now
    };

    const sourceJournal: Record<string, any> = {
      id: sourceJournalId, period_id: period.id, branch_id: sourceBranchId, district_id: sourceDistrictId,
      entry_date: date, description, reference: externalReference, currency_code: currency,
      exchange_rate_to_base: rate, base_currency_code: state.baseCurrencyCode,
      source_type: 'financial_transfer', source_id: transferId, status: 'draft',
      approval_checked_at: now, approved_at: null
    };
    state.journals.push(sourceJournal);
    const sourceDebitAccount = sourceBranchId === destinationBranchId ? destinationChart.id : dueFrom!.id;
    const sourceCreditAccount = sourceChart.id;
    state.journalLines.push(
      { id: id(state, 'line'), journal_entry_id: sourceJournalId, line_number: 1, account_id: sourceDebitAccount,
        branch_id: sourceBranchId, description, debit_amount: amount, credit_amount: 0,
        base_debit_amount: baseAmount, base_credit_amount: 0 },
      { id: id(state, 'line'), journal_entry_id: sourceJournalId, line_number: 2, account_id: sourceCreditAccount,
        branch_id: sourceBranchId, description, debit_amount: 0, credit_amount: amount,
        base_debit_amount: 0, base_credit_amount: baseAmount }
    );

    if (destinationJournalId) {
      state.journals.push({
        id: destinationJournalId, period_id: period.id, branch_id: destinationBranchId, district_id: destinationDistrictId,
        entry_date: date, description, reference: externalReference, currency_code: currency,
        exchange_rate_to_base: rate, base_currency_code: state.baseCurrencyCode,
        source_type: 'financial_transfer', source_id: transferId, status: 'draft',
        approval_checked_at: now, approved_at: null
      });
      state.journalLines.push(
        { id: id(state, 'line'), journal_entry_id: destinationJournalId, line_number: 1, account_id: destinationChart.id,
          branch_id: destinationBranchId, description, debit_amount: amount, credit_amount: 0,
          base_debit_amount: baseAmount, base_credit_amount: 0 },
        { id: id(state, 'line'), journal_entry_id: destinationJournalId, line_number: 2, account_id: dueTo!.id,
          branch_id: destinationBranchId, description, debit_amount: 0, credit_amount: amount,
          base_debit_amount: 0, base_credit_amount: baseAmount }
      );
    }

    const sourceApproval = createTransferApprovalRequest(state, transferId, sourceBranchId, sourceDistrictId, actor.id, baseAmount);
    if (sourceApproval.error) return fail(sourceApproval.error);
    transfer.source_approval_request_id = sourceApproval.request.id;
    let destinationApproval: any = null;
    if (destinationJournalId) {
      destinationApproval = createTransferApprovalRequest(state, transferId, destinationBranchId, destinationDistrictId, actor.id, baseAmount);
      if (destinationApproval.error) return fail(destinationApproval.error);
      transfer.destination_approval_request_id = destinationApproval.request.id;
    }
    const fullyApproved = sourceApproval.request.status === 'approved' &&
      (!destinationApproval || destinationApproval.request.status === 'approved');
    transfer.status = fullyApproved ? 'approved' : 'pending_approval';
    if (fullyApproved) {
      sourceJournal.approved_at = now;
      const destJournal = destinationJournalId ? state.journals.find(item => item.id === destinationJournalId) : null;
      if (destJournal) destJournal.approved_at = now;
    }
    state.transfers.push(transfer);
    storage.save(state);
    return success({
      transfer_id: transferId, transfer_number: transferNumber,
      source_approval_request_id: transfer.source_approval_request_id,
      destination_approval_request_id: transfer.destination_approval_request_id,
      source_journal_entry_id: sourceJournalId, destination_journal_entry_id: destinationJournalId,
      status: transfer.status, idempotent_replay: false
    });
  }

  function decideFinancialTransferApproval(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const step = state.approvalSteps.find(item => item.id === args.p_request_step_id);
    const request = step && state.approvalRequests.find(item => item.id === step.approval_request_id && item.transaction_type === 'financial_transfer');
    const transfer = request && state.transfers.find(item => item.id === request.target_id);
    if (!step || !request || !transfer) return fail('Approval step is not for an internal financial transfer');
    if (transfer.status === 'rejected' || transfer.status === 'posted' || request.status !== 'pending' || step.status !== 'pending') {
      return fail('This transfer is no longer open for approval');
    }
    if (!['approved', 'rejected'].includes(args.p_decision)) return fail('Approval decision must be approved or rejected');
    if (step.prohibit_submitter_approval && request.submitted_by_profile_id === actor.id) {
      return fail('The submitter cannot approve this request', '42501');
    }
    if (!hasScopePermission(state, actor.id, step.required_permission_key || 'approve_finances', request.branch_id, request.district_id)) {
      return fail('Approver does not have the required branch permission', '42501');
    }
    if (state.approvalDecisions.some(item => item.approval_request_step_id === step.id && item.approver_profile_id === actor.id)) {
      return fail('This profile has already decided this approval step');
    }
    const otherSteps = state.approvalSteps.filter(item => item.approval_request_id === request.id && item.id !== step.id);
    if (state.approvalDecisions.some(item => otherSteps.some(other => other.id === item.approval_request_step_id) &&
      item.approver_profile_id === actor.id)) {
      return fail('Each approval level requires a different approver');
    }
    state.approvalDecisions.push({
      id: id(state, 'decision'), approval_request_step_id: step.id,
      approver_profile_id: actor.id, decision: args.p_decision,
      comments: String(args.p_comments || '').trim() || null, decided_at: new Date().toISOString()
    });
    if (args.p_decision === 'rejected') {
      step.status = 'rejected';
      request.status = 'rejected';
      transfer.status = 'rejected';
    } else {
      const received = state.approvalDecisions.filter(item => item.approval_request_step_id === step.id && item.decision === 'approved').length;
      if (received >= Number(step.required_approvals || 1)) step.status = 'approved';
      const allSteps = state.approvalSteps.filter(item => item.approval_request_id === request.id);
      if (allSteps.every(item => item.status === 'approved')) request.status = 'approved';
      const requests = state.approvalRequests.filter(item =>
        item.transaction_type === 'financial_transfer' && item.target_id === transfer.id);
      if (requests.some(item => item.status === 'rejected')) transfer.status = 'rejected';
      else if (requests.every(item => item.status === 'approved')) {
        transfer.status = 'approved';
        for (const journal of state.journals.filter(item =>
          item.source_type === 'financial_transfer' && item.source_id === transfer.id && item.status === 'draft')) {
          journal.approved_at = new Date().toISOString();
        }
      } else transfer.status = 'pending_approval';
    }
    transfer.updated_at = new Date().toISOString();
    storage.save(state);
    return success({
      transfer_id: transfer.id, approval_request_id: request.id,
      approval_status: request.status, status: transfer.status
    });
  }

  function postFinancialTransfer(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const transfer = state.transfers.find(item => item.id === args.p_transfer_id);
    if (!transfer) return fail('Financial transfer not found');
    if (transfer.status === 'posted') return success({
      transfer_id: transfer.id, status: 'posted', already_posted: true,
      source_journal_entry_id: transfer.source_journal_entry_id,
      destination_journal_entry_id: transfer.destination_journal_entry_id
    });
    if (transfer.status !== 'approved') return fail('Both affected branch approval workflows must be complete before posting');
    if (!hasPermission(state, actor.id, 'post_journals', transfer.source_branch_id) ||
        !hasPermission(state, actor.id, 'post_journals', transfer.destination_branch_id)) {
      return fail('Posting actor must have post-journals permission in both affected branches', '42501');
    }
    const requests = state.approvalRequests.filter(item =>
      item.transaction_type === 'financial_transfer' && item.target_id === transfer.id);
    if (!requests.length || requests.some(item => item.status !== 'approved')) {
      return fail('Both affected branch approval workflows must be approved');
    }
    const journalIds = [transfer.source_journal_entry_id, transfer.destination_journal_entry_id].filter(Boolean);
    for (const journalId of journalIds) {
      const journal = state.journals.find(item => item.id === journalId);
      if (!journal || journal.status !== 'draft' || journal.source_type !== 'financial_transfer' ||
          journal.source_id !== transfer.id || !journal.approved_at) {
        return fail('Every transfer journal must be an approved draft before atomic posting');
      }
      const period = state.periods.find(item => item.id === journal.period_id);
      if (!period || period.status !== 'open' || period.year_status !== 'open' ||
          journal.entry_date < period.start_date || journal.entry_date > period.end_date) {
        return fail('Transfer journal financial period or year is not open');
      }
      const lines = state.journalLines.filter(item => item.journal_entry_id === journal.id);
      if (lines.length < 2) return fail('A transfer journal must contain at least two lines');
      const debit = round4(lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0));
      const credit = round4(lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0));
      const baseDebit = round4(lines.reduce((sum, line) => sum + Number(line.base_debit_amount || 0), 0));
      const baseCredit = round4(lines.reduce((sum, line) => sum + Number(line.base_credit_amount || 0), 0));
      if (debit <= 0 || debit !== credit || baseDebit <= 0 || baseDebit !== baseCredit) {
        return fail('Transfer journal must balance in transaction and base currency');
      }
      for (const line of lines) {
        const account = state.chartAccounts.find(item => item.id === line.account_id && item.is_active);
        if (!account) return fail('Transfer journal contains an inactive or missing chart account');
        if (line.branch_id !== journal.branch_id) return fail('Transfer journal line is outside its branch scope');
      }
    }
    for (const journalId of journalIds) {
      const journal = state.journals.find(item => item.id === journalId)!;
      journal.status = 'posted';
      journal.posted_at = new Date().toISOString();
    }
    transfer.status = 'posted';
    transfer.updated_at = new Date().toISOString();
    storage.save(state);
    return success({
      transfer_id: transfer.id, status: 'posted', already_posted: false,
      source_journal_entry_id: transfer.source_journal_entry_id,
      destination_journal_entry_id: transfer.destination_journal_entry_id
    });
  }

  function getFinanceTransferReconciliation(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const scopeType = String(args.p_scope_type || '');
    const scopeId = args.p_scope_id ?? null;
    const scope = resolveMockFinanceScope(state, scopeType, scopeId);
    if ('error' in scope) return fail(scope.error);
    const canView = ['view_finances', 'manage_finances', 'approve_finances', 'post_journals'].some(permission =>
      hasScopePermission(state, actor.id, permission, scope.branchId, scope.districtId));
    if (!canView) return fail('Insufficient permission to view transfer reconciliation in this scope', '42501');

    const branchById = new Map(state.branches.map(branch => [branch.id, branch]));
    const inScope = (branchId: string) => {
      if (scopeType === 'church') return true;
      const branch = branchById.get(branchId);
      if (scopeType === 'district') return (branch?.district_id ?? null) === scopeId;
      return branchId === scopeId;
    };
    const transfers = state.transfers
      .filter(item => inScope(item.source_branch_id) || inScope(item.destination_branch_id))
      .map(item => {
        const sourceBranch = branchById.get(item.source_branch_id);
        const destinationBranch = branchById.get(item.destination_branch_id);
        const sourceJournal = state.journals.find(journal => journal.id === item.source_journal_entry_id);
        const destinationJournal = item.destination_journal_entry_id
          ? state.journals.find(journal => journal.id === item.destination_journal_entry_id)
          : null;
        const sourceAccount = state.financialAccounts.find(account => account.id === item.source_financial_account_id);
        const destinationAccount = state.financialAccounts.find(account => account.id === item.destination_financial_account_id);
        const sourceClearingLines = item.source_branch_id === item.destination_branch_id ? [] :
          state.journalLines.filter(line => line.journal_entry_id === item.source_journal_entry_id &&
            line.account_id !== sourceAccount?.chart_account_id);
        const destinationClearingLines = state.journalLines.filter(line =>
          line.journal_entry_id === item.destination_journal_entry_id &&
          line.account_id !== destinationAccount?.chart_account_id);
        const sourceAmount = round4(sourceClearingLines.reduce((sum, line) =>
          sum + Number(line.base_debit_amount || 0) - Number(line.base_credit_amount || 0), 0));
        const destinationAmount = round4(destinationClearingLines.reduce((sum, line) =>
          sum + Number(line.base_credit_amount || 0) - Number(line.base_debit_amount || 0), 0));
        const sourceClearingAccountId = sourceClearingLines[0]?.account_id ?? null;
        const destinationClearingAccountId = destinationClearingLines[0]?.account_id ?? null;
        const bothSidesInScope = inScope(item.source_branch_id) && inScope(item.destination_branch_id);
        let reconciliationStatus = 'not_posted';
        if (item.status === 'rejected') reconciliationStatus = 'rejected';
        else if (item.status === 'posted' && item.source_branch_id === item.destination_branch_id &&
          sourceJournal?.status === 'posted') reconciliationStatus = 'not_required';
        else if (item.status === 'posted' && !bothSidesInScope) reconciliationStatus = 'counterpart_outside_scope';
        else if (item.status === 'posted' && sourceJournal?.status === 'posted' &&
          destinationJournal?.status === 'posted' && Math.abs(sourceAmount - destinationAmount) <= 0.0001) {
          reconciliationStatus = 'matched';
        } else if (item.status === 'posted') reconciliationStatus = 'mismatch';
        const eliminationAmount = reconciliationStatus === 'matched'
          ? Math.min(Math.max(sourceAmount, 0), Math.max(destinationAmount, 0)) : 0;
        return {
          transfer_id: item.id, transfer_number: item.transfer_number, transaction_date: item.transaction_date,
          source_branch_id: item.source_branch_id, source_branch_name: sourceBranch?.name || item.source_branch_id,
          destination_branch_id: item.destination_branch_id, destination_branch_name: destinationBranch?.name || item.destination_branch_id,
          amount: item.amount, currency_code: item.currency_code,
          base_currency_code: sourceJournal?.base_currency_code || state.baseCurrencyCode || item.currency_code,
          status: item.status, description: item.description, external_reference: item.external_reference ?? null,
          source_journal_entry_id: item.source_journal_entry_id, source_journal_status: sourceJournal?.status ?? null,
          source_entry_number: sourceJournal?.entry_number ?? null, source_posted_at: sourceJournal?.posted_at ?? null,
          destination_journal_entry_id: item.destination_journal_entry_id ?? null,
          destination_journal_status: destinationJournal?.status ?? null,
          destination_entry_number: destinationJournal?.entry_number ?? null, destination_posted_at: destinationJournal?.posted_at ?? null,
          source_due_from_base_amount: sourceAmount, destination_due_to_base_amount: destinationAmount,
          source_clearing_account_id: sourceClearingAccountId,
          destination_clearing_account_id: destinationClearingAccountId,
          both_sides_in_scope: bothSidesInScope,
          source_in_scope: inScope(item.source_branch_id),
          destination_in_scope: inScope(item.destination_branch_id),
          reconciliation_status: reconciliationStatus, elimination_base_amount: eliminationAmount
        };
      }).sort((a,b) => String(b.transaction_date).localeCompare(String(a.transaction_date)) || Number(b.transfer_number)-Number(a.transfer_number));

    const summary = new Map<string, { base_currency_code: string; due_from_balance: number; due_to_balance: number; elimination_amount: number }>();
    for (const transfer of transfers) {
      if (transfer.status !== 'posted' || transfer.source_branch_id === transfer.destination_branch_id) continue;
      const current = summary.get(transfer.base_currency_code) || {
        base_currency_code: transfer.base_currency_code, due_from_balance: 0, due_to_balance: 0, elimination_amount: 0
      };
      if (inScope(transfer.source_branch_id) && transfer.source_journal_status === 'posted') {
        current.due_from_balance += Number(transfer.source_due_from_base_amount || 0);
      }
      if (inScope(transfer.destination_branch_id) && transfer.destination_journal_status === 'posted') {
        current.due_to_balance += Number(transfer.destination_due_to_base_amount || 0);
      }
      current.elimination_amount += Number(transfer.elimination_base_amount || 0);
      summary.set(transfer.base_currency_code, current);
    }
    return success({
      actor_profile_id: actor.id, scope_type: scopeType, scope_id: scopeId,
      transfers,
      clearing_summary: [...summary.values()].map(item => ({
        ...item,
        remaining_due_from: item.due_from_balance - item.elimination_amount,
        remaining_due_to: item.due_to_balance - item.elimination_amount
      })).sort((a,b) => a.base_currency_code.localeCompare(b.base_currency_code))
    });
  }

  function getFinancialTransfers(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = String(args.p_branch_id || '');
    if (!branchId || !['view_finances','manage_finances','approve_finances'].some(permission =>
      hasPermission(state, actor.id, permission, branchId))) {
      return fail('Insufficient permission to view transfers for this branch', '42501');
    }
    const visible = state.transfers.filter(item =>
      item.source_branch_id === branchId || item.destination_branch_id === branchId);
    const mapApproval = (requestId: string | null) => {
      const request = requestId ? state.approvalRequests.find(item => item.id === requestId) : null;
      if (!request) return { status: null, steps: [], actorStepId: null };
      const steps = state.approvalSteps.filter(item => item.approval_request_id === request.id)
        .sort((a,b) => Number(a.step_order)-Number(b.step_order));
      const actorStep = steps.find(step => step.status === 'pending' &&
        (!step.prohibit_submitter_approval || request.submitted_by_profile_id !== actor.id) &&
        !state.approvalDecisions.some(decision => decision.approval_request_step_id === step.id && decision.approver_profile_id === actor.id) &&
        !steps.some(prior => prior.step_order < step.step_order && prior.status !== 'approved') &&
        hasScopePermission(state, actor.id, step.required_permission_key || 'approve_finances', request.branch_id, request.district_id));
      return {
        status: request.status, actorStepId: actorStep?.id ?? null,
        steps: steps.map(step => ({
          id: step.id, step_order: step.step_order, required_approvals: step.required_approvals,
          status: step.status,
          approvals_received: state.approvalDecisions.filter(decision =>
            decision.approval_request_step_id === step.id && decision.decision === 'approved').length
        }))
      };
    };
    return success({
      actor_profile_id: actor.id,
      transfers: visible.map(item => {
        const source = mapApproval(item.source_approval_request_id);
        const destination = mapApproval(item.destination_approval_request_id);
        return {
          ...clone(item),
          source_approval_status: source.status,
          destination_approval_status: destination.status,
          source_approval_steps: source.steps,
          destination_approval_steps: destination.steps,
          source_actor_approval_step_id: source.actorStepId,
          destination_actor_approval_step_id: destination.actorStepId
        };
      }).sort((a,b) => String(b.transaction_date).localeCompare(String(a.transaction_date)))
    });
  }

  function decideApproval(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const step = state.approvalSteps.find(s => s.id === args.p_request_step_id);
    if (!step) return fail('Approval step not found');
    const request = state.approvalRequests.find(r => r.id === step.approval_request_id && r.transaction_type === 'financial_document');
    const document = request && state.documents.find(d => d.id === request.target_id);
    if (!request || !document) return fail('Approval step is not for a financial document');
    if (step.status !== 'pending' || request.status !== 'pending') return fail('Approval step is no longer pending');
    const earlierIncompleteStep = state.approvalSteps.some(s => s.approval_request_id === request.id &&
      s.step_order < step.step_order && s.status !== 'approved');
    if (earlierIncompleteStep) return fail('Earlier approval steps must be completed first');
    if (step.prohibit_submitter_approval && request.submitted_by_profile_id === actor.id) {
      return fail('The submitter cannot approve this request', '42501');
    }
    const requiredPermission = step.required_permission_key || 'approve_finances';
    if (!hasScopePermission(state, actor.id, requiredPermission, document.branch_id ?? null, document.district_id ?? null)) {
      return fail('Approver does not have the required permission', '42501');
    }
    if (!['approved', 'rejected'].includes(args.p_decision)) return fail('Approval decision must be approved or rejected');
    if (state.approvalDecisions.some(d => d.approval_request_step_id === step.id && d.approver_profile_id === actor.id)) {
      return fail('This profile has already decided this approval step');
    }
    const otherStepIds = new Set(
      state.approvalSteps
        .filter(s => s.approval_request_id === request.id && s.id !== step.id)
        .map(s => s.id)
    );
    if (state.approvalDecisions.some(d => otherStepIds.has(d.approval_request_step_id) && d.approver_profile_id === actor.id)) {
      return fail('Each approval level requires a different approver');
    }
    state.approvalDecisions.push({
      id: id(state, 'decision'), approval_request_step_id: step.id,
      approver_profile_id: actor.id, decision: args.p_decision,
      comments: String(args.p_comments || '').trim() || null,
      decided_at: new Date().toISOString()
    });
    if (args.p_decision === 'rejected') {
      step.status = 'rejected';
      request.status = 'rejected';
      document.status = 'rejected';
      return persistDecision(state, request, document, null);
    }
    const approvalsReceived = state.approvalDecisions.filter(d =>
      d.approval_request_step_id === step.id && d.decision === 'approved').length;
    if (approvalsReceived >= Number(step.required_approvals || 1)) step.status = 'approved';
    const allStepsApproved = state.approvalSteps
      .filter(s => s.approval_request_id === request.id)
      .every(s => s.status === 'approved');
    if (!allStepsApproved) return persistDecision(state, request, document, null);
    request.status = 'approved';
    document.status = 'approved';
    const journal = state.journals.find(j =>
      j.source_type === 'financial_document_pending' && j.source_id === document.id && j.status === 'draft');
    if (!journal) return fail('Approved financial document has no matching pending journal');
    journal.source_type = 'financial_document';
    document.journal_entry_id = journal.id;
    return persistDecision(state, request, document, journal.id);
  }

  function persistDecision(state: MockFinanceState, request: Record<string, any>, document: Record<string, any>, journalId: string | null) {
    storage.save(state);
    return success({ document_id: document.id, approval_request_id: request.id, journal_entry_id: journalId, approval_status: request.status });
  }

  function submitEventBudgetForApproval(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const event = state.events.find(item => item.id === args.p_event_id);
    if (!event) return fail('Event does not exist in the local mock event store');
    const branchId = event.branch_id;
    if (!branchId || !hasPermission(state, actor.id, 'manage_events', branchId) ||
        !hasPermission(state, actor.id, 'submit_event_budgets', branchId)) {
      return fail('Insufficient permission to submit an event budget for this event', '42501');
    }
    const period = state.periods.find(item => item.id === args.p_period_id &&
      item.status === 'open' && item.year_status === 'open');
    if (!period) return fail('Selected financial period and year must be open');
    const name = String(args.p_name || '').trim();
    const currency = String(args.p_currency_code || '').trim().toUpperCase();
    const rate = Number(args.p_exchange_rate_to_base);
    const lines = args.p_lines;
    if (!name || currency.length !== 3 || !Number.isFinite(rate) || rate <= 0 || !Array.isArray(lines)) {
      return fail('Event, period, name, currency, exchange rate and budget lines are required');
    }
    if (!state.baseCurrencyCode || !state.currencies.includes(currency)) return fail('A valid event budget currency is required');
    if (currency === state.baseCurrencyCode && rate !== 1) return fail('Exchange rate must be 1 for the base currency');
    if (!lines.length) return fail('An event budget requires at least one positive budget line');
    const normalizedLines = [];
    let total = 0;
    for (const line of lines) {
      const amount = Number(line.allocated_amount);
      const account = state.chartAccounts.find(item => item.id === line.account_id &&
        item.is_active && !item.is_control_account && item.account_type === 'expense');
      const fund = line.fund_id == null ? null : state.funds.find(item => item.id === line.fund_id && item.is_active);
      if (!Number.isFinite(amount) || amount < 0 || !account || (line.fund_id != null && !fund)) {
        return fail('Budget lines must use active expense accounts and active funds with non-negative amounts');
      }
      total += amount;
      normalizedLines.push({
        id: id(state, 'budget-line'), account_id: account.id, fund_id: line.fund_id ?? null,
        description: String(line.description || '').trim() || null, allocated_amount: amount
      });
    }
    total = round4(total);
    if (total <= 0) return fail('An event budget requires a positive budget total');

    const today = new Date().toISOString().slice(0, 10);
    const policy = state.approvalPolicies
      .filter(item => item.is_active && item.transaction_type === 'budget' &&
        (item.branch_id == null || item.branch_id === branchId) &&
        (!item.effective_from || item.effective_from <= today) &&
        (!item.effective_to || item.effective_to >= today))
      .sort((a, b) => Number(b.branch_id != null) - Number(a.branch_id != null))[0];
    if (!policy) return fail('No active event budget approval policy is configured');
    const baseAmount = round4(total * rate);
    const band = state.approvalPolicyBands.find(item => item.policy_id === policy.id &&
      baseAmount >= Number(item.min_amount_base) &&
      (item.max_amount_base == null || baseAmount < Number(item.max_amount_base)));
    if (!band) return fail('No event budget approval threshold band covers this amount');
    const policySteps = state.approvalPolicySteps.filter(item => item.band_id === band.id)
      .sort((a, b) => Number(a.step_number) - Number(b.step_number));
    if (!policySteps.length) return fail('Event budget approval policy must contain at least one approval step');
    if (policySteps.some((step, index) =>
      Number(step.step_number) !== index + 1 ||
      !step.required_permission_key ||
      !Number.isInteger(Number(step.required_approvals)) ||
      Number(step.required_approvals) < 1)) {
      return fail('Event budget approval policy steps must be ordered and permission-scoped');
    }

    const budgetId = id(state, 'budget');
    const requestId = id(state, 'approval');
    const budget = {
      id: budgetId, name, budget_type: 'event', branch_id: branchId, event_id: event.id,
      period_id: period.id, currency_code: currency, exchange_rate_to_base: rate,
      base_currency_code: state.baseCurrencyCode, status: 'pending_approval',
      submitted_by_profile_id: actor.id, approval_request_id: requestId, total_budget: total,
      approved_at: null, payment_document_id: null, created_at: new Date().toISOString()
    };
    const request = {
      id: requestId, transaction_type: 'budget', target_id: budgetId, branch_id: branchId,
      status: 'pending', policy_id: policy.id, submitted_by_profile_id: actor.id,
      amount_base: baseAmount, policy_version: policy.version ?? null,
      policy_snapshot: { name: policy.name, version: policy.version, band_id: band.id }
    };
    const steps = policySteps.map(policyStep => ({
      id: id(state, 'step'), approval_request_id: requestId,
      step_order: Number(policyStep.step_number),
      required_permission_key: policyStep.required_permission_key || 'approve_finances',
      required_approvals: Number(policyStep.required_approvals || 1),
      prohibit_submitter_approval: Boolean(policyStep.prohibit_submitter_approval),
      status: 'pending', decision: null, comments: null
    })).sort((a, b) => a.step_order - b.step_order);
    state.budgets.push(budget);
    state.budgetLines.push(...normalizedLines.map(line => ({ ...line, budget_id: budgetId })));
    state.approvalRequests.push(request);
    state.approvalSteps.push(...steps);
    storage.save(state);
    return success({ budget_id: budgetId, approval_request_id: requestId, status: 'pending_approval',
      total_budget: total, currency_code: currency });
  }

  function getEventBudgetSubmissionOptions(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const event = state.events.find(item => item.id === args.p_event_id);
    if (!event) return fail('Event does not exist in the local mock event store');
    if (!hasPermission(state, actor.id, 'manage_events', event.branch_id) ||
        !hasPermission(state, actor.id, 'submit_event_budgets', event.branch_id)) {
      return fail('Insufficient permission to prepare an event budget for this event', '42501');
    }
    return success({
      currencies: clone(state.currencies),
      baseCurrencyCode: state.baseCurrencyCode,
      chartAccounts: clone(state.chartAccounts.filter(account =>
        account.is_active && account.account_type === 'expense' && !account.is_control_account)),
      funds: clone(state.funds.filter(fund => fund.is_active)),
      periods: clone(state.periods.filter(period => period.status === 'open' && period.year_status === 'open'))
    });
  }

  function getMyEventBudgets(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const event = state.events.find(item => item.id === args.p_event_id);
    if (!event) return fail('Event does not exist in the local mock event store');
    if (!hasPermission(state, actor.id, 'manage_events', event.branch_id) ||
        !hasPermission(state, actor.id, 'submit_event_budgets', event.branch_id)) {
      return fail('Insufficient permission to view event budget submissions for this event', '42501');
    }
    const budgets = state.budgets.filter(budget => budget.budget_type === 'event' &&
      budget.event_id === event.id && budget.branch_id === event.branch_id &&
      budget.submitted_by_profile_id === actor.id).map(budget => {
        const request = state.approvalRequests.find(item => item.id === budget.approval_request_id &&
          item.transaction_type === 'budget' && item.target_id === budget.id);
        const steps = request ? state.approvalSteps.filter(item => item.approval_request_id === request.id)
          .sort((a, b) => Number(a.step_order) - Number(b.step_order)).map(step => ({
            step_number: step.step_order,
            required_approvals: step.required_approvals || 1,
            status: step.status,
            approvals_received: state.approvalDecisions.filter(decision =>
              decision.approval_request_step_id === step.id && decision.decision === 'approved').length
          })) : [];
        return {
          ...clone(budget),
          lines: state.budgetLines.filter(line => line.budget_id === budget.id).map(clone),
          approval_status: request?.status ?? null,
          approval_steps: steps
        };
      });
    return success({ budgets });
  }

  function decideEventBudgetApproval(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const step = state.approvalSteps.find(item => item.id === args.p_request_step_id);
    const request = step && state.approvalRequests.find(item => item.id === step.approval_request_id && item.transaction_type === 'budget');
    const budget = request && state.budgets.find(item => item.id === request.target_id && item.budget_type === 'event');
    if (!step || !request || !budget || budget.approval_request_id !== request.id) {
      return fail('Approval step is not an event budget approval');
    }
    if (step.status !== 'pending' || request.status !== 'pending') return fail('Approval step is no longer pending');
    if (!['approved', 'rejected'].includes(args.p_decision)) return fail('Approval decision must be approved or rejected');
    if (step.prohibit_submitter_approval && request.submitted_by_profile_id === actor.id) {
      return fail('The budget submitter cannot approve their own event budget', '42501');
    }
    const requiredPermission = step.required_permission_key || 'approve_finances';
    if (!hasPermission(state, actor.id, requiredPermission, budget.branch_id)) {
      return fail('You do not have the required permission to decide this event budget step', '42501');
    }
    if (state.approvalSteps.some(item =>
      item.approval_request_id === request.id &&
      item.step_order < step.step_order && item.status !== 'approved')) {
      return fail('Earlier approval steps must be completed first');
    }
    if (state.approvalDecisions.some(item =>
      item.approval_request_step_id === step.id && item.approver_profile_id === actor.id)) {
      return fail('This profile has already decided this approval step');
    }
    const otherBudgetStepIds = new Set(
      state.approvalSteps
        .filter(item => item.approval_request_id === request.id && item.id !== step.id)
        .map(item => item.id)
    );
    if (state.approvalDecisions.some(item =>
      otherBudgetStepIds.has(item.approval_request_step_id) && item.approver_profile_id === actor.id)) {
      return fail('Each approval level requires a different approver');
    }
    state.approvalDecisions.push({
      id: id(state, 'decision'), approval_request_step_id: step.id,
      approver_profile_id: actor.id, decision: args.p_decision,
      comments: String(args.p_comments || '').trim() || null,
      decided_at: new Date().toISOString()
    });
    if (args.p_decision === 'rejected') {
      step.status = 'rejected';
      request.status = 'rejected';
      budget.status = 'rejected';
    } else {
      const approvalsReceived = state.approvalDecisions.filter(item =>
        item.approval_request_step_id === step.id && item.decision === 'approved').length;
      if (approvalsReceived >= Number(step.required_approvals || 1)) step.status = 'approved';
      const allStepsApproved = state.approvalSteps
        .filter(item => item.approval_request_id === request.id)
        .every(item => item.status === 'approved');
      if (allStepsApproved) {
        request.status = 'approved';
        budget.status = 'approved';
        budget.approved_at = new Date().toISOString();
        budget.approved_by_profile_id = actor.id;
      }
    }
    storage.save(state);
    return success({ approval_status: request.status, budget_id: budget.id, status: budget.status });
  }

  function createEventBudgetPayment(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const budget = state.budgets.find(item => item.id === args.p_budget_id && item.budget_type === 'event');
    if (!budget) return fail('Approved event budget not found');
    if (!hasPermission(state, actor.id, 'manage_finances', budget.branch_id)) {
      return fail('Insufficient permission to create a payment for this event budget', '42501');
    }
    const request = state.approvalRequests.find(item => item.id === budget.approval_request_id &&
      item.transaction_type === 'budget' && item.target_id === budget.id && item.status === 'approved');
    if (budget.status !== 'approved' || !budget.approved_at || !request) {
      return fail('Only an approved event budget can be paid');
    }
    if (state.documents.some(item => item.source_budget_id === budget.id)) {
      return fail('An event budget payment is already linked to this budget', '23505');
    }
    const lines = state.budgetLines.filter(item => item.budget_id === budget.id);
    const total = round4(lines.reduce((sum, item) => sum + Number(item.allocated_amount || 0), 0));
    const amount = Number(args.p_amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > total) {
      return fail('Payment amount must be positive and cannot exceed the approved event budget');
    }
    const rate = Number(args.p_exchange_rate_to_base ?? 1);
    if (!args.p_transaction_date || rate !== Number(budget.exchange_rate_to_base)) {
      return fail('Payment date and the approved budget exchange rate are required');
    }
    if (String(args.p_currency_code || budget.currency_code).trim().toUpperCase() !== budget.currency_code) {
      return fail('Payment currency must match the approved event budget currency');
    }
    if (!lines.some(item => item.account_id === args.p_category_account_id &&
      (item.fund_id ?? null) === (args.p_fund_id ?? null))) {
      return fail('Payment expense account and fund must match an approved event budget line');
    }
    const txArgs = {
      ...args,
      p_document_type: 'payment',
      p_branch_id: budget.branch_id,
      p_currency_code: budget.currency_code,
      p_exchange_rate_to_base: rate,
      p_idempotency_key: args.p_idempotency_key || `event-budget-${budget.id}`
    };
    const created = createTransaction(txArgs, state, false);
    if (created.error) return created;
    const document = state.documents.find(item => item.id === created.data.document_id);
    if (!document || document.document_type !== 'payment' || document.branch_id !== budget.branch_id) {
      return fail('Canonical payment could not be linked to the approved event budget');
    }
    document.source_budget_id = budget.id;
    budget.payment_document_id = document.id;
    storage.save(state);
    return success({ ...created.data, source_budget_id: budget.id });
  }

  function getEventBudgets(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = args.p_branch_id ?? null;
    const visible = state.budgets.filter(budget =>
      budget.budget_type === 'event' && (!branchId || budget.branch_id === branchId) &&
      (hasPermission(state, actor.id, 'view_finances', budget.branch_id) ||
       hasPermission(state, actor.id, 'manage_finances', budget.branch_id) ||
       hasPermission(state, actor.id, 'approve_finances', budget.branch_id))
    );
    return success({ budgets: visible.map(budget => {
      const lines = state.budgetLines.filter(line => line.budget_id === budget.id).map(clone);
      const document = state.documents.find(item => item.source_budget_id === budget.id);
      const journal = document?.journal_entry_id
        ? state.journals.find(item => item.id === document.journal_entry_id && item.status === 'posted')
        : null;
      const actual = journal ? state.journalLines
        .filter(line => line.journal_entry_id === journal.id && Number(line.debit_amount) > 0 &&
          state.chartAccounts.some(account => account.id === line.account_id && account.account_type === 'expense'))
        .reduce((sum, line) => sum + Number(line.debit_amount || 0), 0) : 0;
      const approvalRequest = state.approvalRequests.find(item => item.id === budget.approval_request_id);
      const approvalSteps = approvalRequest
        ? state.approvalSteps.filter(item => item.approval_request_id === approvalRequest.id).map(clone)
        : [];
      return { ...clone(budget), lines, payment_document: document ? clone(document) : null,
        approval_request: approvalRequest ? clone(approvalRequest) : null,
        approval_steps: approvalSteps,
        posted_journal_entry_id: journal?.id ?? null, total_actual: round4(actual) };
    }) });
  }

  function getMyFinanceScopes() {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const permissionKeys = ['view_finances', 'manage_finances', 'approve_finances'];
    const canAtChurch = permissionKeys.some(permission => hasPermission(state, actor.id, permission, null));
    const scopes: Array<{ scope_type: 'church' | 'district' | 'branch'; scope_id: string | null; scope_name: string; district_id: string | null; branch_id: string | null }> = [];
    if (canAtChurch) {
      scopes.push({ scope_type: 'church', scope_id: null, scope_name: 'Church-wide', district_id: null, branch_id: null });
    }
    for (const district of state.districts.filter(item => item.status !== 'inactive' && item.status !== 'archived')) {
      const allowed = canAtChurch || permissionKeys.some(permission =>
        hasDistrictPermission(state, actor.id, permission, district.id));
      if (allowed) scopes.push({
        scope_type: 'district', scope_id: district.id, scope_name: district.name,
        district_id: district.id, branch_id: null
      });
    }
    for (const branch of state.branches.filter(item => item.status !== 'inactive' && item.status !== 'archived')) {
      const allowed = permissionKeys.some(permission => hasPermission(state, actor.id, permission, branch.id));
      if (allowed) scopes.push({
        scope_type: 'branch', scope_id: branch.id, scope_name: branch.name || branch.id,
        district_id: branch.district_id ?? null, branch_id: branch.id
      });
    }
    const rank = { church: 0, district: 1, branch: 2 };
    scopes.sort((a, b) => rank[a.scope_type] - rank[b.scope_type] || a.scope_name.localeCompare(b.scope_name));
    return success(scopes);
  }

  function resolveMockFinanceScope(state: MockFinanceState, scopeType: string, scopeId: string | null) {
    if (!['church', 'district', 'branch'].includes(scopeType)) return { error: 'Finance scope must be church, district or branch' };
    if (scopeType === 'church') {
      if (scopeId !== null) return { error: 'Church-wide finance scope must not include a scope ID' };
      return { branchId: null, districtId: null };
    }
    if (!scopeId) return { error: 'A district or branch ID is required' };
    if (scopeType === 'district') return { branchId: null, districtId: scopeId };
    const branch = state.branches.find(item => item.id === scopeId);
    if (!branch) return { error: 'Finance branch does not exist in the mock finance state' };
    return { branchId: scopeId, districtId: branch.district_id ?? null };
  }

  function getFinanceScopeConfiguration(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const scopeType = String(args.p_scope_type || '');
    const scopeId = args.p_scope_id ?? null;
    const scope = resolveMockFinanceScope(state, scopeType, scopeId);
    if ('error' in scope) return fail(scope.error);
    const canView = scopeType === 'church'
      ? hasPermission(state, actor.id, 'view_finances', null) || hasPermission(state, actor.id, 'manage_finances', null) || hasPermission(state, actor.id, 'approve_finances', null)
      : scopeType === 'district'
        ? ['view_finances','manage_finances','approve_finances'].some(permission => hasDistrictPermission(state, actor.id, permission, scopeId))
        : ['view_finances','manage_finances','approve_finances'].some(permission => hasPermission(state, actor.id, permission, scopeId));
    if (!canView) return fail('Insufficient permission to view finance configuration in this scope', '42501');
    const policies = state.approvalPolicies.filter(policy =>
      policy.transaction_type !== 'requisition' &&
      (policy.branch_id ?? null) === scope.branchId &&
      (policy.district_id ?? null) === scope.districtId);
    const policyIds = new Set(policies.map(policy => policy.id));
    const bandIds = new Set(state.approvalPolicyBands.filter(band => policyIds.has(band.policy_id)).map(band => band.id));
    return success({
      scope: { type: scopeType, id: scopeId },
      currencies: clone(state.currencies), baseCurrencyCode: state.baseCurrencyCode,
      chartAccounts: clone(state.chartAccounts),
      financialAccounts: clone(state.financialAccounts.filter(account =>
        matchesExactScope(account, scopeType, scope.branchId, scope.districtId))),
      funds: clone(state.funds.filter(fund =>
        matchesExactScope(fund, scopeType, scope.branchId, scope.districtId))),
      financialYears: clone(state.financialYears), periods: clone(state.periods),
      approvalPolicies: clone(policies),
      approvalPolicyBands: clone(state.approvalPolicyBands.filter(band => policyIds.has(band.policy_id))),
      approvalPolicySteps: clone(state.approvalPolicySteps.filter(step => bandIds.has(step.band_id)))
    });
  }

  function getFinanceScopeTransactionOptions(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const scopeType = String(args.p_scope_type || '');
    const scopeId = args.p_scope_id ?? null;
    const scope = resolveMockFinanceScope(state, scopeType, scopeId);
    if ('error' in scope) return fail(scope.error);
    const canView = ['view_finances', 'manage_finances', 'approve_finances'].some(permission =>
      hasScopePermission(state, actor.id, permission, scope.branchId, scope.districtId));
    if (!canView) return fail('Insufficient permission to view finance transaction options in this scope', '42501');
    const policies = state.approvalPolicies
      .filter(policy => policy.transaction_type !== 'requisition' &&
        matchesHierarchicalScope(policy, scopeType, scope.branchId, scope.districtId))
      .sort((a: any, b: any) => Number(b.branch_id != null) - Number(a.branch_id != null) ||
        Number(b.district_id != null) - Number(a.district_id != null) ||
        Number(b.version || 0) - Number(a.version || 0));
    const policyIds = new Set(policies.map(policy => policy.id));
    const bandIds = new Set(state.approvalPolicyBands.filter(band => policyIds.has(band.policy_id)).map(band => band.id));
    return success({
      scope: { type: scopeType, id: scopeId },
      currencies: clone(state.currencies), baseCurrencyCode: state.baseCurrencyCode,
      chartAccounts: clone(state.chartAccounts),
      financialAccounts: clone(state.financialAccounts.filter(account =>
        matchesHierarchicalScope(account, scopeType, scope.branchId, scope.districtId))),
      funds: clone(state.funds.filter(fund =>
        matchesHierarchicalScope(fund, scopeType, scope.branchId, scope.districtId))),
      financialYears: clone(state.financialYears), periods: clone(state.periods),
      approvalPolicies: clone(policies),
      approvalPolicyBands: clone(state.approvalPolicyBands.filter(band => policyIds.has(band.policy_id))),
      approvalPolicySteps: clone(state.approvalPolicySteps.filter(step => bandIds.has(step.band_id)))
    });
  }

  function saveFinanceScopeResources(args: Record<string, any> = {}) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const scopeType = String(args.p_scope_type || '');
    const scopeId = args.p_scope_id ?? null;
    const scope = resolveMockFinanceScope(state, scopeType, scopeId);
    if (scope.error) return fail(scope.error);
    if (!Array.isArray(args.p_financial_accounts) || !Array.isArray(args.p_funds)) return fail('Financial accounts and funds must be supplied as arrays');
    const canManage = scopeType === 'church'
      ? hasPermission(state, actor.id, 'manage_finances', null)
      : scopeType === 'district'
        ? hasDistrictPermission(state, actor.id, 'manage_finances', scopeId)
        : hasPermission(state, actor.id, 'manage_finances', scopeId);
    if (!canManage) return fail('Insufficient permission to manage finance resources in this scope', '42501');

    let accountsCreated = 0;
    let fundsCreated = 0;
    for (const item of args.p_financial_accounts) {
      const accountId = String(item?.id || '');
      const chartId = String(item?.chart_account_id || '');
      const name = String(item?.name || '').trim();
      const accountType = item?.account_type;
      const currency = String(item?.currency_code || '').trim().toUpperCase();
      if (!accountId || !chartId || !name || !['cash','bank','mobile_money','clearing'].includes(accountType) ||
          !/^[A-Z]{3}$/.test(currency)) return fail('Financial account requires an ID, asset chart account, name, account type and currency');
      if (!state.currencies.includes(currency) || !state.chartAccounts.some(chart =>
        chart.id === chartId && chart.is_active && chart.account_type === 'asset' && !chart.is_control_account)) {
        return fail('Financial account requires an active currency and active non-control asset chart account');
      }
      if ((item.branch_id ?? null) !== scope.branchId ||
          (scopeType === 'branch' && item.district_id != null && item.district_id !== scope.districtId) ||
          (scopeType !== 'branch' && (item.district_id ?? null) !== scope.districtId)) return fail('Financial account ownership does not match the requested scope');
      const existing = state.financialAccounts.find(account => account.id === accountId);
      if (existing) {
        const same = existing.chart_account_id === chartId && (existing.branch_id ?? null) === scope.branchId &&
          (existing.district_id ?? null) === scope.districtId && existing.name === name &&
          existing.account_type === accountType && existing.currency_code === currency &&
          (existing.provider_name ?? null) === (item.provider_name ?? null) &&
          (existing.account_reference ?? null) === (item.account_reference ?? null) &&
          existing.is_active === (item.is_active ?? true);
        if (!same) return fail('Existing financial account definitions are immutable');
      } else {
        state.financialAccounts.push({ ...clone(item), id: accountId, branch_id: scope.branchId,
          district_id: scope.districtId, name, account_type: accountType, currency_code: currency,
          is_active: item.is_active ?? true });
        accountsCreated++;
      }
    }

    for (const item of args.p_funds) {
      const fundId = String(item?.id || '');
      const name = String(item?.name || '').trim();
      const code = String(item?.code || '').trim().toUpperCase();
      const fundType = item?.fund_type ?? 'general';
      if (!fundId || !name || !code || !['general','designated','restricted'].includes(fundType)) {
        return fail('Fund requires an ID, code, name and valid fund type');
      }
      if ((item.branch_id ?? null) !== scope.branchId ||
          (scopeType === 'branch' && item.district_id != null && item.district_id !== scope.districtId) ||
          (scopeType !== 'branch' && (item.district_id ?? null) !== scope.districtId)) return fail('Fund ownership does not match the requested scope');
      const existing = state.funds.find(fund => fund.id === fundId);
      if (existing) {
        const same = existing.name === name && existing.code === code &&
          (existing.description ?? null) === (item.description ?? null) &&
          (existing.fund_type ?? 'general') === fundType &&
          (existing.is_default ?? false) === (item.is_default ?? false) &&
          existing.is_active === (item.is_active ?? true) &&
          (existing.branch_id ?? null) === scope.branchId && (existing.district_id ?? null) === scope.districtId;
        if (!same) return fail('Existing fund definitions are immutable');
      } else {
        state.funds.push({ ...clone(item), id: fundId, name, code, fund_type: fundType,
          branch_id: scope.branchId, district_id: scope.districtId,
          is_default: item.is_default ?? false, is_active: item.is_active ?? true });
        fundsCreated++;
      }
    }
    storage.save(state);
    return success({ saved: true, financial_accounts_created: accountsCreated, funds_created: fundsCreated,
      scope_type: scopeType, scope_id: scopeId });
  }

  function getFinanceConfiguration(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = args.p_branch_id ?? actor.branch_id ?? null;
    const canView = hasPermission(state, actor.id, 'view_finances', branchId) ||
      hasPermission(state, actor.id, 'manage_finances', branchId) ||
      hasPermission(state, actor.id, 'approve_finances', branchId);
    if (!canView) return fail('Insufficient permission to view finance configuration in this scope', '42501');
    const policies = state.approvalPolicies.filter(policy =>
      policy.transaction_type !== 'requisition' &&
      ((policy.branch_id ?? null) === branchId || (branchId !== null && policy.branch_id == null)));
    const policyIds = new Set(policies.map(policy => policy.id));
    const bandIds = new Set(state.approvalPolicyBands.filter(band => policyIds.has(band.policy_id)).map(band => band.id));
    return success({
      currencies: clone(state.currencies), baseCurrencyCode: state.baseCurrencyCode,
      chartAccounts: clone(state.chartAccounts),
      financialAccounts: clone(state.financialAccounts.filter(account => (account.branch_id ?? null) === branchId)),
      funds: clone(state.funds), financialYears: clone(state.financialYears), periods: clone(state.periods),
      approvalPolicies: clone(policies),
      approvalPolicyBands: clone(state.approvalPolicyBands.filter(band => policyIds.has(band.policy_id))),
      approvalPolicySteps: clone(state.approvalPolicySteps.filter(step => bandIds.has(step.band_id)))
    });
  }

  function getRequisitionApprovalConfiguration(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = args.p_branch_id ?? null;
    if (!hasPermission(state, actor.id, 'manage_finances', branchId)) {
      return fail('Insufficient permission to view requisition approval configuration in this scope', '42501');
    }

    const policies = state.approvalPolicies.filter(policy =>
      policy.transaction_type === 'requisition' &&
      ((policy.branch_id ?? null) === branchId || (branchId !== null && policy.branch_id == null)));
    const policyIds = new Set(policies.map(policy => policy.id));
    const bands = state.approvalPolicyBands.filter(band => policyIds.has(band.policy_id));
    const bandIds = new Set(bands.map(band => band.id));
    return success({
      policies: clone(policies),
      bands: clone(bands),
      steps: clone(state.approvalPolicySteps.filter(step => bandIds.has(step.band_id)))
    });
  }

  function saveRequisitionApprovalPolicy(args: Record<string, any> = {}) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = args.p_branch_id ?? null;
    if (!hasPermission(state, actor.id, 'manage_finances', branchId)) {
      return fail('Insufficient permission to manage requisition approval configuration in this scope', '42501');
    }

    const name = String(args.p_name || '').trim();
    const min = Number(args.p_min_amount_base);
    const max = args.p_max_amount_base == null ? null : Number(args.p_max_amount_base);
    const steps = args.p_steps;
    if (!name || !Number.isFinite(min) || min < 0 ||
        (max !== null && (!Number.isFinite(max) || max <= min))) {
      return fail('A policy name and valid amount band are required');
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      return fail('At least one ordered requisition approval step is required');
    }
    const normalizedSteps = steps.map((step: any) => ({
      step_number: Number(step.step_number),
      required_approvals: Number(step.required_approvals)
    })).sort((a: any, b: any) => a.step_number - b.step_number);
    if (normalizedSteps.some((step: any, index: number) =>
      !Number.isInteger(step.step_number) || step.step_number !== index + 1 ||
      !Number.isInteger(step.required_approvals) || step.required_approvals < 1)) {
      return fail('Requisition approval steps must be numbered consecutively from one with positive approval counts');
    }

    const version = Math.max(0, ...state.approvalPolicies
      .filter(policy => policy.transaction_type === 'requisition' && (policy.branch_id ?? null) === branchId)
      .map(policy => Number(policy.version) || 0)) + 1;
    const policyId = id(state, 'requisition-policy');
    const bandId = id(state, 'requisition-band');
    const policy = {
      id: policyId, name, is_active: true, transaction_type: 'requisition' as const,
      branch_id: branchId, version, effective_from: new Date().toISOString().slice(0, 10),
      min_amount: min, max_amount: max, approver_profile_ids: []
    };
    state.approvalPolicies.push(policy);
    state.approvalPolicyBands.push({
      id: bandId, policy_id: policyId, min_amount_base: min, max_amount_base: max
    });
    const stepIds = normalizedSteps.map(step => {
      const stepId = id(state, 'requisition-step');
      state.approvalPolicySteps.push({
        id: stepId, band_id: bandId, step_number: step.step_number,
        required_permission_key: 'approve_requisitions',
        required_approvals: step.required_approvals,
        prohibit_submitter_approval: true
      });
      return stepId;
    });
    storage.save(state);
    return success({ policy_id: policyId, band_id: bandId, step_count: stepIds.length, version });
  }

  function createDepartmentRequisitionPayment(args: Record<string, any> = {}) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const requisition = state.requisitions.find(item => item.id === args.p_requisition_id);
    if (!requisition) return fail('Department requisition not found');
    if (!hasPermission(state, actor.id, 'manage_finances', requisition.branch_id)) {
      return fail('Insufficient permission to pay a requisition in this branch', '42501');
    }
    if (requisition.status !== 'approved') return fail('Only approved requisitions can receive payments');
    const requestKey = String(args.p_request_key || '').trim();
    if (!requestKey) return fail('A payment idempotency request key is required');
    const existing = state.documents.find(item =>
      item.source_requisition_id === requisition.id && item.source_request_key === requestKey);
    if (existing) {
      const journal = state.journals.find(item => item.source_id === existing.id &&
        ['financial_document_pending', 'financial_document'].includes(item.source_type));
      return success({
        document_id: existing.id, journal_entry_id: existing.journal_entry_id ?? journal?.id ?? null,
        status: existing.status, requisition_id: requisition.id, already_exists: true
      });
    }
    if (args.p_profile_id) {
      const selectedProfile = state.profiles.find(item => item.id === args.p_profile_id &&
        item.branch_id === requisition.branch_id &&
        item.membership_status === 'active' && item.record_status === 'active');
      if (!selectedProfile) return fail('Selected member profile must be active in the requisition branch');
    }
    const amount = Number(args.p_amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail('Payment amount must be positive');
    const linked = state.documents.filter(item => item.source_requisition_id === requisition.id);
    let paid = 0;
    let reserved = 0;
    for (const document of linked) {
      const journal = state.journals.find(item => item.id === document.journal_entry_id ||
        (item.source_id === document.id && ['financial_document_pending', 'financial_document'].includes(item.source_type)));
      if (document.status === 'posted' && journal?.status === 'posted' && document.journal_entry_id === journal.id) {
        paid += Number(document.amount || 0);
      } else if (['draft', 'pending_approval', 'approved'].includes(document.status) && journal?.status !== 'posted') {
        reserved += Number(document.amount || 0);
      }
    }
    const remaining = round4(Number(requisition.requested_amount) - paid - reserved);
    if (remaining <= 0) return fail('The approved requisition amount is already fully paid or reserved');
    if (round4(amount) > remaining) return fail('Payment exceeds the remaining approved requisition amount');
    const rate = Number(requisition.exchange_rate_to_base);
    if (String(args.p_currency_code || requisition.currency).trim().toUpperCase() !== requisition.currency ||
        Number(args.p_exchange_rate_to_base ?? rate) !== rate) {
      return fail('Payment currency and exchange rate must match the approved requisition');
    }
    const txArgs = {
      ...args,
      p_document_type: 'payment',
      p_branch_id: requisition.branch_id,
      p_currency_code: requisition.currency,
      p_exchange_rate_to_base: rate,
      p_description: String(args.p_description || '').trim() || requisition.title,
      p_idempotency_key: args.p_idempotency_key || requestKey
    };
    const created = createTransaction(txArgs, state, false);
    if (created.error) return created;
    const document = state.documents.find(item => item.id === created.data.document_id);
    if (!document || document.document_type !== 'payment' ||
        document.branch_id !== requisition.branch_id || document.currency_code !== requisition.currency) {
      return fail('Canonical payment could not be linked to the approved requisition');
    }
    document.source_requisition_id = requisition.id;
    document.source_request_key = requestKey;
    storage.save(state);
    return success({ ...created.data, requisition_id: requisition.id, source_requisition_id: requisition.id, already_exists: false });
  }

  function getDepartmentRequisitionPaymentSummary(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = args.p_branch_id ?? null;
    if (!branchId || !hasPermission(state, actor.id, 'manage_finances', branchId)) {
      return fail('Insufficient permission to view requisition payment details in this branch', '42501');
    }
    const requisitions = state.requisitions.filter(item => item.branch_id === branchId);
    return success(requisitions.map(requisition => {
      const payments = state.documents.filter(item => item.source_requisition_id === requisition.id);
      let paid = 0;
      let reserved = 0;
      const paymentRows = payments.map(document => {
        const journal = state.journals.find(item => item.id === document.journal_entry_id ||
          (item.source_id === document.id && ['financial_document_pending', 'financial_document'].includes(item.source_type)));
        if (document.status === 'posted' && journal?.status === 'posted' && document.journal_entry_id === journal.id) {
          paid += Number(document.amount || 0);
        } else if (['draft', 'pending_approval', 'approved'].includes(document.status) && journal?.status !== 'posted') {
          reserved += Number(document.amount || 0);
        }
        return {
          document_id: document.id, journal_entry_id: document.journal_entry_id ?? journal?.id ?? null,
          amount: document.amount, currency_code: document.currency_code, status: document.status,
          journal_status: journal?.status ?? null, transaction_date: document.transaction_date,
          external_reference: document.external_reference
        };
      });
      paid = round4(paid);
      reserved = round4(reserved);
      const remaining = Math.max(0, round4(Number(requisition.requested_amount) - paid - reserved));
      return {
        requisition_id: requisition.id, requested_amount: requisition.requested_amount,
        currency_code: requisition.currency, paid_amount: paid, reserved_amount: reserved,
        remaining_amount: remaining,
        payment_status: paid >= Number(requisition.requested_amount) ? 'paid' :
          paid > 0 ? 'partially_paid' : reserved > 0 ? 'payment_pending' : 'unpaid',
        payments: paymentRows
      };
    }));
  }

  function getDepartmentRequisitions(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = args.p_branch_id ?? actor.branch_id ?? null;
    if (!branchId) return fail('A branch is required to view requisitions');
    const canSubmit = hasPermission(state, actor.id, 'submit_requisitions', branchId);
    const canApprove = hasPermission(state, actor.id, 'approve_requisitions', branchId);
    const canManage = hasPermission(state, actor.id, 'manage_finances', branchId);
    if (!canSubmit && !canApprove && !canManage) {
      return fail('Insufficient permission to view requisitions in this branch', '42501');
    }

    const requisitions = state.requisitions
      .filter(requisition => requisition.branch_id === branchId &&
        (requisition.applicant_profile_id === actor.id || canApprove || canManage))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(requisition => {
        const request = state.approvalRequests.find(item =>
          item.id === requisition.approval_request_id && item.transaction_type === 'requisition');
        const steps = request ? state.approvalSteps
          .filter(item => item.approval_request_id === request.id)
          .sort((a, b) => Number(a.step_order) - Number(b.step_order)) : [];
        return {
          ...clone(requisition),
          items: clone(state.requisitionItems.filter(item => item.requisition_id === requisition.id)
            .sort((a, b) => Number(a.line_number) - Number(b.line_number))
            .map(item => ({ ...item, total_price: item.line_total }))),
          approval_request: request ? clone(request) : null,
          approval_steps: steps.map(step => {
            const decisions = state.approvalDecisions.filter(item => item.approval_request_step_id === step.id);
            const approvalsReceived = decisions.filter(item => item.decision === 'approved').length;
            const actorCanDecide = step.status === 'pending' && request?.status === 'pending' &&
              hasPermission(state, actor.id, step.required_permission_key || 'approve_requisitions', branchId) &&
              (!step.prohibit_submitter_approval || request?.submitted_by_profile_id !== actor.id) &&
              !decisions.some(item => item.approver_profile_id === actor.id) &&
              !steps.some(prior => prior.step_order < step.step_order && prior.status !== 'approved');
            return {
              id: step.id,
              step_number: step.step_order,
              required_permission_key: step.required_permission_key,
              required_approvals: Number(step.required_approvals || 1),
              prohibit_submitter_approval: Boolean(step.prohibit_submitter_approval),
              status: step.status,
              approvals_received: approvalsReceived,
              actor_can_decide: actorCanDecide,
              decisions: clone(decisions)
            };
          })
        };
      });
    return success(requisitions);
  }

  function getDepartmentRequisitionSubmissionOptions(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = args.p_branch_id;
    if (!branchId || !hasPermission(state, actor.id, 'submit_requisitions', branchId)) {
      return fail('Insufficient permission to prepare a requisition in this branch', '42501');
    }
    if (actor.branch_id !== branchId || actor.membership_status !== 'active' || actor.record_status !== 'active') {
      return fail('The submitting profile must be an active member of the selected branch', '42501');
    }
    const ministry = state.ministries.find(item => item.id === args.p_ministry_id &&
      item.status === 'active' && ['ministry', 'department'].includes(item.entity_type) &&
      (item.branch_id == null || item.branch_id === branchId));
    if (!ministry) return fail('Select an active ministry or department in the same branch');
    if (!state.baseCurrencyCode) return fail('Church base currency must be configured before requisitions can be submitted');
    return success({
      branch_id: branchId,
      ministry_id: ministry.id,
      ministry_name: ministry.name,
      base_currency_code: state.baseCurrencyCode,
      currencies: clone(state.currencies)
    });
  }

  function submitDepartmentRequisition(args: Record<string, any> = {}) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const branchId = args.p_branch_id;
    if (!branchId || !hasPermission(state, actor.id, 'submit_requisitions', branchId)) {
      return fail('Insufficient permission to submit a requisition in this branch', '42501');
    }
    if (actor.branch_id !== branchId || actor.membership_status !== 'active' || actor.record_status !== 'active') {
      return fail('The submitting profile must be an active member of the selected branch', '42501');
    }
    const ministry = state.ministries.find(item => item.id === args.p_ministry_id &&
      item.status === 'active' && ['ministry', 'department'].includes(item.entity_type) &&
      (item.branch_id == null || item.branch_id === branchId));
    if (!ministry) return fail('Select an active ministry or department in the same branch');

    const title = String(args.p_title || '').trim();
    const amount = Number(args.p_requested_amount);
    const currency = String(args.p_currency_code || '').trim().toUpperCase();
    const rate = Number(args.p_exchange_rate_to_base);
    const priority = args.p_priority;
    const items = args.p_items;
    if (!title || !Number.isFinite(amount) || amount <= 0 || !currency ||
        !Number.isFinite(rate) || rate <= 0 ||
        !['low', 'medium', 'high', 'urgent'].includes(priority)) {
      return fail('A title, positive amount, currency, exchange rate and priority are required');
    }
    if (!Array.isArray(items) || items.length === 0) return fail('A requisition requires at least one item');
    if (!state.currencies.includes(currency)) return fail('Select an active requisition currency');
    if (!state.baseCurrencyCode) return fail('Church base currency must be configured before requisitions can be submitted');
    if (currency === state.baseCurrencyCode && rate !== 1) return fail('Exchange rate must be 1 for the church base currency');
    const normalizedItems = items.map((item: any) => ({
      item_name: String(item.item_name || '').trim(),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price)
    }));
    if (normalizedItems.some((item: any) => !item.item_name ||
      !Number.isFinite(item.quantity) || item.quantity <= 0 ||
      !Number.isFinite(item.unit_price) || item.unit_price < 0)) {
      return fail('Requisition items require a name, positive quantity and non-negative unit price');
    }
    const itemsTotal = round4(normalizedItems.reduce((sum: number, item: any) =>
      sum + round4(item.quantity * item.unit_price), 0));
    if (itemsTotal <= 0 || round4(amount) !== itemsTotal) {
      return fail('The requested amount must equal the sum of the requisition item lines');
    }

    const baseAmount = round4(amount * rate);
    const today = new Date().toISOString().slice(0, 10);
    const policy = state.approvalPolicies
      .filter(item => item.is_active && item.transaction_type === 'requisition' &&
        (item.branch_id == null || item.branch_id === branchId) &&
        (!item.effective_from || item.effective_from <= today) &&
        (!item.effective_to || item.effective_to >= today))
      .sort((a, b) => Number(b.branch_id != null) - Number(a.branch_id != null) ||
        Number(b.version || 0) - Number(a.version || 0))[0];
    if (!policy) return fail('No active requisition approval policy is configured for this branch');
    const band = state.approvalPolicyBands.find(item => item.policy_id === policy.id &&
      baseAmount >= Number(item.min_amount_base) &&
      (item.max_amount_base == null || baseAmount < Number(item.max_amount_base)));
    if (!band) return fail('No requisition approval threshold band covers this amount');
    const policySteps = state.approvalPolicySteps.filter(item => item.band_id === band.id)
      .sort((a, b) => Number(a.step_number) - Number(b.step_number));
    if (!policySteps.length || policySteps.some((step, index) =>
      Number(step.step_number) !== index + 1 ||
      step.required_permission_key !== 'approve_requisitions' ||
      step.prohibit_submitter_approval !== true)) {
      return fail('Requisition approval policy must have ordered approval_requisitions steps that prohibit submitter approval');
    }

    let sequence = state.requisitions.length + 1;
    let requisitionNumber = `REQ-${today.slice(0, 4)}-${String(sequence).padStart(6, '0')}`;
    while (state.requisitions.some(item => item.requisition_number === requisitionNumber)) {
      sequence += 1;
      requisitionNumber = `REQ-${today.slice(0, 4)}-${String(sequence).padStart(6, '0')}`;
    }
    const requisitionId = id(state, 'requisition');
    const requestId = id(state, 'requisition-approval');
    const applicantName = [actor.first_name, actor.last_name].filter(Boolean).join(' ').trim() || actor.id;
    const requisition = {
      id: requisitionId,
      requisition_number: requisitionNumber,
      branch_id: branchId,
      ministry_id: ministry.id,
      department_name: ministry.name,
      applicant_profile_id: actor.id,
      applicant_name: applicantName,
      title,
      description: String(args.p_description || '').trim() || null,
      requested_amount: amount,
      currency,
      exchange_rate_to_base: rate,
      base_currency_code: state.baseCurrencyCode,
      priority,
      status: 'pending_approval',
      needed_by_date: args.p_needed_by_date || null,
      vendor_quote_reference: String(args.p_vendor_quote_reference || '').trim() || null,
      approval_request_id: requestId,
      created_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      approved_at: null,
      approved_by_profile_id: null
    };
    const steps = policySteps.map(policyStep => ({
      id: id(state, 'requisition-step'),
      approval_request_id: requestId,
      step_order: Number(policyStep.step_number),
      required_permission_key: policyStep.required_permission_key,
      required_approvals: Number(policyStep.required_approvals),
      prohibit_submitter_approval: true,
      status: 'pending'
    }));
    state.requisitions.push(requisition);
    state.requisitionItems.push(...normalizedItems.map((item: any, index: number) => ({
      id: id(state, 'requisition-item'),
      requisition_id: requisitionId,
      line_number: index + 1,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: round4(item.quantity * item.unit_price)
    })));
    state.approvalRequests.push({
      id: requestId,
      transaction_type: 'requisition',
      target_id: requisitionId,
      branch_id: branchId,
      status: 'pending',
      policy_id: policy.id,
      policy_version: policy.version,
      band_id: band.id,
      amount_base: baseAmount,
      submitted_by_profile_id: actor.id,
      submitted_at: new Date().toISOString(),
      policy_snapshot: {
        policy_name: policy.name,
        policy_version: policy.version,
        min_amount_base: band.min_amount_base,
        max_amount_base: band.max_amount_base,
        steps: policySteps.map(step => ({
          step_number: step.step_number,
          required_permission_key: step.required_permission_key,
          required_approvals: step.required_approvals,
          prohibit_submitter_approval: true
        }))
      }
    });
    state.approvalSteps.push(...steps);
    storage.save(state);
    return success({
      requisition_id: requisitionId,
      requisition_number: requisitionNumber,
      approval_request_id: requestId,
      status: 'pending_approval',
      requested_amount: amount,
      currency_code: currency
    });
  }

  function decideDepartmentRequisitionApproval(args: Record<string, any> = {}) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const step = state.approvalSteps.find(item => item.id === args.p_request_step_id);
    const request = step && state.approvalRequests.find(item =>
      item.id === step.approval_request_id && item.transaction_type === 'requisition');
    const requisition = request && state.requisitions.find(item =>
      item.id === request.target_id && item.approval_request_id === request.id);
    if (!step || !request || !requisition) return fail('Approval step is not a department requisition approval');
    if (step.status !== 'pending' || request.status !== 'pending' || requisition.status !== 'pending_approval') {
      return fail('Requisition approval step is no longer pending');
    }
    if (!['approved', 'rejected'].includes(args.p_decision)) return fail('Decision must be approved or rejected');
    if (step.prohibit_submitter_approval && request.submitted_by_profile_id === actor.id) {
      return fail('The submitter cannot approve this request', '42501');
    }
    if (!hasPermission(state, actor.id, step.required_permission_key || 'approve_requisitions', requisition.branch_id)) {
      return fail('Approver does not have the required requisition permission', '42501');
    }
    const steps = state.approvalSteps.filter(item => item.approval_request_id === request.id)
      .sort((a, b) => Number(a.step_order) - Number(b.step_order));
    if (steps.some(item => item.step_order < step.step_order && item.status !== 'approved')) {
      return fail('Earlier approval steps must be completed first');
    }
    if (state.approvalDecisions.some(item =>
      item.approval_request_step_id === step.id && item.approver_profile_id === actor.id)) {
      return fail('This profile has already decided this approval step');
    }
    const otherReqStepIds = new Set(
      steps.filter(item => item.id !== step.id).map(item => item.id)
    );
    if (state.approvalDecisions.some(item =>
      otherReqStepIds.has(item.approval_request_step_id) && item.approver_profile_id === actor.id)) {
      return fail('Each approval level requires a different approver');
    }

    state.approvalDecisions.push({
      id: id(state, 'requisition-decision'),
      approval_request_step_id: step.id,
      approver_profile_id: actor.id,
      decision: args.p_decision,
      comments: String(args.p_comments || '').trim() || null,
      decided_at: new Date().toISOString()
    });

    let approvalStatus = 'pending';
    if (args.p_decision === 'rejected') {
      step.status = 'rejected';
      request.status = 'rejected';
      request.completed_at = new Date().toISOString();
      requisition.status = 'rejected';
    } else {
      const approvalsReceived = state.approvalDecisions.filter(item =>
        item.approval_request_step_id === step.id && item.decision === 'approved').length;
      if (approvalsReceived >= Number(step.required_approvals || 1)) step.status = 'approved';
      const allStepsApproved = steps.every(item => item.status === 'approved');
      if (allStepsApproved) {
        request.status = 'approved';
        request.completed_at = new Date().toISOString();
        requisition.status = 'approved';
        requisition.approved_at = new Date().toISOString();
        requisition.approved_by_profile_id = actor.id;
        approvalStatus = 'approved';
      }
    }
    storage.save(state);
    return success({
      requisition_id: requisition.id,
      approval_request_id: request.id,
      approval_status: approvalStatus,
      status: requisition.status
    });
  }

  function getFinanceDocuments(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const requestedBranch = args.p_branch_id ?? actor.branch_id ?? null;
    const canView = (branchId: string) =>
      hasPermission(state, actor.id, 'view_finances', branchId) ||
      hasPermission(state, actor.id, 'manage_finances', branchId) ||
      hasPermission(state, actor.id, 'approve_finances', branchId);
    const visible = state.documents.filter(document =>
      document.branch_id === requestedBranch && canView(document.branch_id)
    );
    return success({
      actor_profile_id: actor.id,
      documents: visible.map((document): Record<string, any> => {
        const request = state.approvalRequests.find(item => item.id === document.approval_request_id);
        const steps = state.approvalSteps.filter(step => step.approval_request_id === request?.id)
          .sort((a, b) => Number(a.step_order) - Number(b.step_order));
        const hasDecidedRequest = steps.some(s =>
          state.approvalDecisions.some(decision =>
            decision.approval_request_step_id === s.id && decision.approver_profile_id === actor.id));
        const actorStep = hasDecidedRequest ? undefined : steps.find(step => step.status === 'pending' &&
          (!step.prohibit_submitter_approval || request?.submitted_by_profile_id !== actor.id) &&
          !state.approvalDecisions.some(decision =>
            decision.approval_request_step_id === step.id && decision.approver_profile_id === actor.id) &&
          !steps.some(prior => prior.step_order < step.step_order && prior.status !== 'approved') &&
          hasPermission(state, actor.id, step.required_permission_key || 'approve_finances', document.branch_id));
        return {
          ...clone(document),
          approval_request_id: request?.id ?? null,
          approval_status: request?.status ?? null,
          approval_steps: steps.map(step => {
            const decisions = state.approvalDecisions.filter(decision => decision.approval_request_step_id === step.id);
            const latestDecision = decisions.sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)))[0];
            return {
              id: step.id, step_order: step.step_order,
              approver_profile_id: latestDecision?.approver_profile_id ?? null,
              required_approvals: Number(step.required_approvals || 1),
              approvals_received: decisions.filter(decision => decision.decision === 'approved').length,
              status: step.status, decision: latestDecision?.decision ?? null,
              comments: latestDecision?.comments ?? null
            };
          }),
          actor_approval_step_id: actorStep?.id ?? null,
          approval_steps_completed: steps.filter(step => step.status === 'approved').length,
          approval_steps_total: steps.length
        };
      }).sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)) ||
        String(b.id).localeCompare(String(a.id)))
    });
  }

  function postJournalEntry(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const journal = state.journals.find(item => item.id === args.p_journal_entry_id);
    if (!journal) return fail('Journal entry not found');
    if (!hasScopePermission(state, actor.id, 'post_journals', journal.branch_id ?? null, journal.district_id ?? null)) {
      return fail('Insufficient permission to post journals', '42501');
    }
    if (journal.status === 'posted') {
      return success({ journal_entry_id: journal.id, status: 'posted', already_posted: true });
    }
    if (journal.status !== 'draft') return fail('Only draft journal entries can be posted');
    if (journal.source_type === 'financial_transfer') {
      return fail('Internal-transfer journals must be posted together through post_financial_transfer');
    }
    if (journal.source_type === 'financial_document_pending') {
      return fail('A financial-document journal cannot be posted before approval and linkage');
    }
    if (journal.source_type === 'financial_document') {
      const document = state.documents.find(item => item.id === journal.source_id);
      if (!document || document.status !== 'approved' || document.journal_entry_id !== journal.id ||
          (document.branch_id ?? null) !== (journal.branch_id ?? null) ||
          (document.district_id ?? null) !== (journal.district_id ?? null)) {
        return fail('Financial-document journal must be linked to an approved document before posting');
      }
    }

    const period = state.periods.find(item => item.id === journal.period_id);
    if (!period || period.status !== 'open' || period.year_status !== 'open' ||
        journal.entry_date < period.start_date || journal.entry_date > period.end_date) {
      return fail('Journal entry period or financial year is not open');
    }
    if (!state.baseCurrencyCode || journal.base_currency_code !== state.baseCurrencyCode) {
      return fail('Journal base currency does not match church base currency');
    }
    if (journal.currency_code === journal.base_currency_code && Number(journal.exchange_rate_to_base) !== 1) {
      return fail('Exchange rate must be 1 for the base currency');
    }

    const lines = state.journalLines.filter(line => line.journal_entry_id === journal.id);
    if (lines.length < 2) return fail('A journal entry must contain at least two lines');
    for (const line of lines) {
      const debit = Number(line.debit_amount || 0);
      const credit = Number(line.credit_amount || 0);
      const baseDebit = Number(line.base_debit_amount || 0);
      const baseCredit = Number(line.base_credit_amount || 0);
      if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 ||
          !Number.isFinite(baseDebit) || !Number.isFinite(baseCredit) || baseDebit < 0 || baseCredit < 0 ||
          (debit > 0) === (credit > 0)) {
        return fail('Each journal line must have a positive debit or positive credit amount, not both or zero');
      }
    }
    const debits = round4(lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0));
    const credits = round4(lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0));
    const baseDebits = round4(lines.reduce((sum, line) => sum + Number(line.base_debit_amount || 0), 0));
    const baseCredits = round4(lines.reduce((sum, line) => sum + Number(line.base_credit_amount || 0), 0));
    if (debits <= 0 || debits !== credits) return fail('Journal is not balanced in transaction currency');
    if (baseDebits <= 0 || baseDebits !== baseCredits) return fail('Journal is not balanced in base currency');

    for (const line of lines) {
      const account = state.chartAccounts.find(item => item.id === line.account_id);
      if (!account || !account.is_active) return fail('Journal contains an inactive chart-of-accounts entry');
      if (journal.branch_id != null && line.branch_id != null && line.branch_id !== journal.branch_id) {
        return fail('Journal line branch does not match journal branch');
      }
      const rate = Number(journal.exchange_rate_to_base);
      if ((Number(line.debit_amount) > 0 && Number(line.base_debit_amount) !== round4(Number(line.debit_amount) * rate)) ||
          (Number(line.credit_amount) > 0 && Number(line.base_credit_amount) !== round4(Number(line.credit_amount) * rate))) {
        return fail('Journal line base amount does not match the recorded exchange rate');
      }
    }

    journal.status = 'posted';
    journal.posted_at = new Date().toISOString();
    if (journal.source_type === 'financial_document') {
      const document = state.documents.find(item => item.id === journal.source_id);
      if (document && document.journal_entry_id === journal.id && document.status === 'approved') {
        document.status = 'posted';
      }
    }
    storage.save(state);
    return success({ journal_entry_id: journal.id, status: 'posted', already_posted: false });
  }

  function getFinanceJournals(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const branchId = args.p_branch_id ?? null;
    const canView = hasPermission(state, actor.id, 'view_finances', branchId)
      || hasPermission(state, actor.id, 'manage_finances', branchId)
      || hasPermission(state, actor.id, 'approve_finances', branchId)
      || hasPermission(state, actor.id, 'post_journals', branchId);
    if (!canView) return fail('Insufficient permission to view journal entries in this branch', '42501');

    const journals = state.journals.filter(journal => (journal.branch_id ?? null) === branchId)
      .map((journal): Record<string, any> => {
        const document = ['financial_document', 'financial_document_pending'].includes(journal.source_type)
          ? state.documents.find(item => item.id === journal.source_id)
          : null;
        const lines = state.journalLines.filter(line => line.journal_entry_id === journal.id)
          .sort((a, b) => Number(a.line_number) - Number(b.line_number))
          .map((line): Record<string, any> => {
            const account = state.chartAccounts.find(item => item.id === line.account_id);
            return {
              ...clone(line),
              account_code: account?.code ?? null,
              account_name: account?.name ?? 'Unknown account',
              account_type: account?.account_type ?? null,
              normal_balance: account?.normal_balance ?? null
            };
          });
        const canPost = journal.status === 'draft'
          && journal.source_type !== 'financial_document_pending'
          && hasScopePermission(state, actor.id, 'post_journals', journal.branch_id ?? null, journal.district_id ?? null)
          && (journal.source_type !== 'financial_document'
            || (document?.status === 'approved' && document.journal_entry_id === journal.id));
        return {
          ...clone(journal),
          source_document_status: document?.status ?? null,
          can_post: canPost,
          total_debits: lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0),
          total_credits: lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0),
          base_total_debits: lines.reduce((sum, line) => sum + Number(line.base_debit_amount || 0), 0),
          base_total_credits: lines.reduce((sum, line) => sum + Number(line.base_credit_amount || 0), 0),
          lines
        };
      })
      .sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)) || String(b.id).localeCompare(String(a.id)));

    const balances = new Map<string, any>();
    for (const journal of state.journals.filter(item => item.status === 'posted' && (item.branch_id ?? null) === branchId)) {
      for (const line of state.journalLines.filter(item => item.journal_entry_id === journal.id)) {
        const account = state.chartAccounts.find(item => item.id === line.account_id);
        if (!account) continue;
        const key = account.id + ':' + journal.base_currency_code;
        const current = balances.get(key) || {
          account_id: account.id, account_code: account.code ?? '', account_name: account.name ?? '',
          account_type: account.account_type, normal_balance: account.normal_balance ?? null,
          base_currency_code: journal.base_currency_code, debit_total: 0, credit_total: 0
        };
        current.debit_total += Number(line.base_debit_amount || 0);
        current.credit_total += Number(line.base_credit_amount || 0);
        balances.set(key, current);
      }
    }
    const accountBalances = [...balances.values()].map(item => ({
      ...item, net_debit_balance: item.debit_total - item.credit_total
    })).sort((a, b) => String(a.account_code).localeCompare(String(b.account_code)));

    return success({ actor_profile_id: actor.id, journals, account_balances: accountBalances });
  }

  function getFinanceScopeDocuments(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const scopeType = String(args.p_scope_type || '');
    const scopeId = args.p_scope_id ?? null;
    const scope = resolveMockFinanceScope(state, scopeType, scopeId);
    if ('error' in scope) return fail(scope.error);
    const canView = ['view_finances', 'manage_finances', 'approve_finances'].some(permission =>
      hasScopePermission(state, actor.id, permission, scope.branchId, scope.districtId));
    if (!canView) return fail('Insufficient permission to view financial documents in this scope', '42501');
    const visible = state.documents.filter(document =>
      ['receipt', 'payment'].includes(document.document_type) &&
      matchesExactScope(document, scopeType, scope.branchId, scope.districtId));
    return success({
      actor_profile_id: actor.id,
      documents: visible.map((document): Record<string, any> => {
        const request = state.approvalRequests.find(item => item.id === document.approval_request_id);
        const steps = state.approvalSteps.filter(step => step.approval_request_id === request?.id)
          .sort((a, b) => Number(a.step_order) - Number(b.step_order));
        const hasDecidedRequest = steps.some(s =>
          state.approvalDecisions.some(decision =>
            decision.approval_request_step_id === s.id && decision.approver_profile_id === actor.id));
        const actorStep = hasDecidedRequest ? undefined : steps.find(step => step.status === 'pending' &&
          (!step.prohibit_submitter_approval || request?.submitted_by_profile_id !== actor.id) &&
          !state.approvalDecisions.some(decision =>
            decision.approval_request_step_id === step.id && decision.approver_profile_id === actor.id) &&
          !steps.some(prior => prior.step_order < step.step_order && prior.status !== 'approved') &&
          hasScopePermission(state, actor.id, step.required_permission_key || 'approve_finances',
            document.branch_id ?? null, document.district_id ?? null));
        return {
          ...clone(document),
          district_id: document.district_id ?? null,
          approval_request_id: request?.id ?? null,
          approval_status: request?.status ?? null,
          approval_steps: steps.map(step => {
            const decisions = state.approvalDecisions.filter(decision => decision.approval_request_step_id === step.id);
            const latestDecision = decisions.sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)))[0];
            return {
              id: step.id, step_order: step.step_order,
              approver_profile_id: latestDecision?.approver_profile_id ?? null,
              required_approvals: Number(step.required_approvals || 1),
              approvals_received: decisions.filter(decision => decision.decision === 'approved').length,
              status: step.status, decision: latestDecision?.decision ?? null,
              comments: latestDecision?.comments ?? null
            };
          }),
          actor_approval_step_id: actorStep?.id ?? null,
          approval_steps_completed: steps.filter(step => step.status === 'approved').length,
          approval_steps_total: steps.length
        };
      }).sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)) ||
        String(b.id).localeCompare(String(a.id)))
    });
  }

  function getFinanceScopeJournals(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const scopeType = String(args.p_scope_type || '');
    const scopeId = args.p_scope_id ?? null;
    const scope = resolveMockFinanceScope(state, scopeType, scopeId);
    if ('error' in scope) return fail(scope.error);
    const canView = ['view_finances', 'manage_finances', 'approve_finances', 'post_journals'].some(permission =>
      hasScopePermission(state, actor.id, permission, scope.branchId, scope.districtId));
    if (!canView) return fail('Insufficient permission to view journal entries in this scope', '42501');

    const matchesReportingScope = (journal: { branch_id?: string | null; district_id?: string | null }) => {
      if (scopeType === 'church') return true;
      if (scopeType === 'district') return (journal.district_id ?? null) === scopeId;
      return (journal.branch_id ?? null) === scopeId;
    };
    const journals = state.journals
      .filter(matchesReportingScope)
      .map((journal): Record<string, any> => {
        const document = ['financial_document', 'financial_document_pending'].includes(journal.source_type)
          ? state.documents.find(item => item.id === journal.source_id)
          : null;
        const lines = state.journalLines.filter(line => line.journal_entry_id === journal.id)
          .sort((a, b) => Number(a.line_number) - Number(b.line_number))
          .map((line): Record<string, any> => {
            const account = state.chartAccounts.find(item => item.id === line.account_id);
            return {
              ...clone(line),
              account_code: account?.code ?? null,
              account_name: account?.name ?? 'Unknown account',
              account_type: account?.account_type ?? null,
              normal_balance: account?.normal_balance ?? null
            };
          });
        const canPost = journal.status === 'draft'
          && journal.source_type !== 'financial_document_pending'
          && hasScopePermission(state, actor.id, 'post_journals', journal.branch_id ?? null, journal.district_id ?? null)
          && (journal.source_type !== 'financial_document'
            || (document?.status === 'approved' && document.journal_entry_id === journal.id));
        return {
          ...clone(journal),
          district_id: journal.district_id ?? null,
          source_document_status: document?.status ?? null,
          can_post: canPost,
          total_debits: lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0),
          total_credits: lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0),
          base_total_debits: lines.reduce((sum, line) => sum + Number(line.base_debit_amount || 0), 0),
          base_total_credits: lines.reduce((sum, line) => sum + Number(line.base_credit_amount || 0), 0),
          lines
        };
      })
      .sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)) || String(b.id).localeCompare(String(a.id)));

    const balances = new Map<string, any>();
    for (const journal of state.journals.filter(item =>
      item.status === 'posted' && matchesReportingScope(item))) {
      for (const line of state.journalLines.filter(item => item.journal_entry_id === journal.id)) {
        const account = state.chartAccounts.find(item => item.id === line.account_id);
        if (!account) continue;
        const key = account.id + ':' + journal.base_currency_code;
        const current = balances.get(key) || {
          account_id: account.id, account_code: account.code ?? '', account_name: account.name ?? '',
          account_type: account.account_type, normal_balance: account.normal_balance ?? null,
          base_currency_code: journal.base_currency_code, debit_total: 0, credit_total: 0
        };
        current.debit_total += Number(line.base_debit_amount || 0);
        current.credit_total += Number(line.base_credit_amount || 0);
        balances.set(key, current);
      }
    }
    const accountBalances = [...balances.values()].map(item => ({
      ...item, net_debit_balance: item.debit_total - item.credit_total
    })).sort((a, b) => String(a.account_code).localeCompare(String(b.account_code)));

    return success({ actor_profile_id: actor.id, journals, account_balances: accountBalances });
  }

  function saveFinanceScopeApprovalPolicies(args: Record<string, any> = {}) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const scopeType = String(args.p_scope_type || '');
    const scopeId = args.p_scope_id ?? null;
    const scope = resolveMockFinanceScope(state, scopeType, scopeId);
    if ('error' in scope) return fail(scope.error);
    const arrays = [args.p_policies, args.p_bands, args.p_steps];
    if (arrays.some(value => !Array.isArray(value))) return fail('Approval policies, bands and steps must be arrays');
    const authorized = scopeType === 'church'
      ? hasPermission(state, actor.id, 'manage_finances', null)
      : scopeType === 'district'
        ? hasDistrictPermission(state, actor.id, 'manage_finances', scopeId) || hasPermission(state, actor.id, 'manage_finances', null)
        : hasPermission(state, actor.id, 'manage_finances', scopeId);
    if (!authorized) return fail('Insufficient permission to manage approval policies in this scope', '42501');

    const newPolicyIds: string[] = [];
    const newBandIds: string[] = [];
    let policiesCreated = 0, bandsCreated = 0, stepsCreated = 0;
    for (const policy of args.p_policies) {
      if (!policy?.id || !policy.name?.trim() || !['financial_document', 'budget', 'financial_transfer'].includes(policy.transaction_type) ||
          !policy.effective_from || (policy.effective_to && policy.effective_to < policy.effective_from)) {
        return fail('Approval policies require a name, transaction type and valid effective dates');
      }
      if (policy.transaction_type === 'financial_transfer' && scopeType !== 'branch') {
        return fail('Internal financial-transfer approval policies must be configured at branch scope');
      }
      const existing = state.approvalPolicies.find(item => item.id === policy.id);
      if (existing) {
        const sameScope = (existing.branch_id ?? null) === scope.branchId &&
          (existing.district_id ?? null) === scope.districtId;
        if (!sameScope || existing.name !== policy.name || existing.transaction_type !== policy.transaction_type ||
            existing.effective_from !== policy.effective_from || (existing.effective_to ?? null) !== (policy.effective_to ?? null) ||
            existing.is_active !== (policy.is_active ?? true)) {
          return fail('Approval policy versions are immutable; create a new version instead');
        }
        continue;
      }
      const requestedBranch = policy.branch_id ?? null;
      const requestedDistrict = policy.district_id ?? null;
      if (requestedBranch !== scope.branchId || (requestedDistrict !== null && requestedDistrict !== scope.districtId)) {
        return fail('New approval policies must match the requested organizational scope');
      }
      const version = Math.max(0, ...state.approvalPolicies
        .filter(item => item.transaction_type === policy.transaction_type &&
          (item.branch_id ?? null) === scope.branchId && (item.district_id ?? null) === scope.districtId)
        .map(item => Number((item as any).version || 0))) + 1;
      state.approvalPolicies.push({
        ...clone(policy), branch_id: scope.branchId, district_id: scope.districtId,
        version, is_active: policy.is_active ?? true, min_amount: 0, max_amount: null,
        approver_profile_ids: []
      });
      newPolicyIds.push(policy.id);
      policiesCreated++;
    }

    for (const band of args.p_bands) {
      if (!band?.id || !band.policy_id || !Number.isFinite(Number(band.min_amount_base)) ||
          Number(band.min_amount_base) < 0 ||
          (band.max_amount_base != null && Number(band.max_amount_base) <= Number(band.min_amount_base))) {
        return fail('Approval amount bands require a valid non-negative range');
      }
      const existing = state.approvalPolicyBands.find(item => item.id === band.id);
      if (existing) {
        if (existing.policy_id !== band.policy_id ||
            Number(existing.min_amount_base) !== Number(band.min_amount_base) ||
            (existing.max_amount_base == null ? null : Number(existing.max_amount_base)) !==
              (band.max_amount_base == null ? null : Number(band.max_amount_base))) {
          return fail('Existing approval amount bands are immutable');
        }
        continue;
      }
      if (!newPolicyIds.includes(band.policy_id)) return fail('New approval bands must belong to a policy created in this save');
      const overlap = state.approvalPolicyBands.some(item => item.policy_id === band.policy_id &&
        Number(item.min_amount_base) < (band.max_amount_base == null ? Number.POSITIVE_INFINITY : Number(band.max_amount_base)) &&
        Number(band.min_amount_base) < (item.max_amount_base == null ? Number.POSITIVE_INFINITY : Number(item.max_amount_base)));
      if (overlap) return fail('Approval amount bands for the same policy cannot overlap');
      state.approvalPolicyBands.push(clone(band));
      newBandIds.push(band.id);
      bandsCreated++;
    }

    for (const step of args.p_steps) {
      if (!step?.id || !step.band_id || !Number.isInteger(Number(step.step_number)) || Number(step.step_number) < 1 ||
          step.required_permission_key !== 'approve_finances' ||
          !Number.isInteger(Number(step.required_approvals)) || Number(step.required_approvals) < 1) {
        return fail('Approval steps require an ordered step, finance approval permission and positive approval count');
      }
      const existing = state.approvalPolicySteps.find(item => item.id === step.id);
      if (existing) {
        if (existing.band_id !== step.band_id || Number(existing.step_number) !== Number(step.step_number) ||
            existing.required_permission_key !== step.required_permission_key ||
            Number(existing.required_approvals) !== Number(step.required_approvals) ||
            (existing.prohibit_submitter_approval !== false) !== (step.prohibit_submitter_approval !== false)) {
          return fail('Existing approval policy steps are immutable');
        }
        continue;
      }
      if (!newBandIds.includes(step.band_id)) return fail('New approval steps must belong to a new amount band created in this save');
      state.approvalPolicySteps.push(clone(step));
      stepsCreated++;
    }

    for (const policyId of newPolicyIds) {
      const policyBands = state.approvalPolicyBands.filter(item => item.policy_id === policyId);
      if (!policyBands.length || policyBands.some(band => !state.approvalPolicySteps.some(step => step.band_id === band.id))) {
        return fail('Every new approval policy amount band requires at least one approval step');
      }
    }
    for (const bandId of newBandIds) {
      const bandSteps = state.approvalPolicySteps.filter(step => step.band_id === bandId).sort((a, b) => Number(a.step_number) - Number(b.step_number));
      if (bandSteps.some((step, index) => Number(step.step_number) !== index + 1)) {
        return fail('Approval policy steps must be consecutive from step one');
      }
    }
    storage.save(state);
    return success({
      saved: true, policies_created: policiesCreated, bands_created: bandsCreated, steps_created: stepsCreated,
      scope_type: scopeType, scope_id: scopeId
    });
  }

  function saveFinanceConfiguration(args: Record<string, any>) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const branchId = args.p_branch_id ?? null;
    const config = args.p_configuration;
    const arrays = ['currencies', 'chartAccounts', 'financialAccounts', 'funds', 'financialYears',
      'periods', 'approvalPolicies', 'approvalPolicyBands', 'approvalPolicySteps'];
    if (!config || typeof config !== 'object' || arrays.some(key => !Array.isArray(config[key]))) {
      return fail('Finance configuration payload is incomplete');
    }
    // Shared church configuration must be authorized at church scope. A
    // branch Finance Officer must not gain permission to change currencies,
    // the chart of accounts, funds, financial years or periods merely because
    // the branch-scoped configuration payload contains those records.
    const scopeMatchesAccountOwner = (item: { branch_id?: string | null; district_id?: string | null }) =>
      branchId === null
        ? (item.branch_id ?? null) === null && (item.district_id ?? null) === null
        : (item.branch_id ?? null) === branchId;
    const submittedFundIds = new Set(config.funds.map((fund: any) => fund.id));
    const fundsBeforeForComparison = state.funds.filter(fund =>
      submittedFundIds.has(fund.id) || ((fund.branch_id ?? null) === null && (fund.district_id ?? null) === null)
    );
    const corePeriods = (items: any[]) => items.map(({ id: periodId, financial_year_id, name, start_date, end_date, status }) => ({
      id: periodId, financial_year_id, name, start_date, end_date, status
    }));
    const globalChartChanged = JSON.stringify([state.currencies, state.baseCurrencyCode, state.chartAccounts, fundsBeforeForComparison]) !==
      JSON.stringify([config.currencies, config.baseCurrencyCode, config.chartAccounts, config.funds]);
    const periodsChanged = JSON.stringify([state.financialYears, corePeriods(state.periods)]) !==
      JSON.stringify([config.financialYears, corePeriods(config.periods)]);
    const branchAccountsBefore = state.financialAccounts.filter(scopeMatchesAccountOwner);
    const branchAccountsChanged = JSON.stringify(branchAccountsBefore) !== JSON.stringify(config.financialAccounts);
    const canManageGlobalFinance = hasPermission(state, actor.id, 'manage_finances', null);
    const canManageGlobalChart = canManageGlobalFinance ||
      hasPermission(state, actor.id, 'manage_chart_of_accounts', null);
    const canManageGlobalPeriods = canManageGlobalFinance ||
      hasPermission(state, actor.id, 'manage_financial_periods', null);

    if (globalChartChanged && !canManageGlobalChart) {
      return fail('Church-wide currency, chart-of-accounts and fund changes require church-level finance configuration permission', '42501');
    }
    if (periodsChanged && !canManageGlobalPeriods) {
      return fail('Financial years and periods require church-level financial-period management permission', '42501');
    }
    if (branchAccountsChanged && !hasPermission(state, actor.id, 'manage_finances', branchId)) {
      return fail('Insufficient permission to manage financial accounts in this branch', '42501');
    }

    // Approval policy versions are immutable. Only new policies may be added,
    // and their scope determines whether church- or branch-level management is
    // required, matching the database configuration RPC.
    const existingPolicies = new Map(state.approvalPolicies.map(policy => [policy.id, policy]));
    for (const policy of config.approvalPolicies) {
      const existing = existingPolicies.get(policy.id);
      if (existing) {
        const immutableFields = ['name', 'transaction_type', 'branch_id', 'version', 'effective_from', 'effective_to', 'is_active'];
        if (immutableFields.some(field => (existing as any)[field] !== policy[field])) {
          return fail('Approval policy versions are immutable; create a new version instead');
        }
        continue;
      }
      if ((policy.branch_id ?? null) !== null && policy.branch_id !== branchId) {
        return fail('New approval policies must match the requested branch scope');
      }
      const authorized = policy.branch_id == null
        ? canManageGlobalFinance
        : hasPermission(state, actor.id, 'manage_finances', policy.branch_id);
      if (!authorized) {
        return fail(policy.branch_id == null
          ? 'Church-wide approval policies require church-level finance management permission'
          : 'Insufficient permission to manage approval policies in this branch', '42501');
      }
    }
    const existingBands = new Map(state.approvalPolicyBands.map(band => [band.id, band]));
    for (const band of config.approvalPolicyBands) {
      const existing = existingBands.get(band.id);
      if (existing && (existing.policy_id !== band.policy_id ||
          Number(existing.min_amount_base) !== Number(band.min_amount_base) ||
          (existing.max_amount_base == null ? null : Number(existing.max_amount_base)) !==
            (band.max_amount_base == null ? null : Number(band.max_amount_base)))) {
        return fail('Existing approval amount bands are immutable');
      }
      if (!existing && existingPolicies.has(band.policy_id)) {
        return fail('New approval amount bands must belong to a policy created in this save');
      }
    }
    const existingSteps = new Map(state.approvalPolicySteps.map(step => [step.id, step]));
    for (const step of config.approvalPolicySteps) {
      const existing = existingSteps.get(step.id);
      if (existing && (existing.band_id !== step.band_id ||
          Number(existing.step_number) !== Number(step.step_number) ||
          existing.required_permission_key !== step.required_permission_key ||
          Number(existing.required_approvals) !== Number(step.required_approvals) ||
          (existing.prohibit_submitter_approval !== false) !== (step.prohibit_submitter_approval !== false))) {
        return fail('Existing approval policy steps are immutable');
      }
      if (!existing && !config.approvalPolicyBands.some((band: any) =>
        band.id === step.band_id && !existingBands.has(band.id))) {
        return fail('New approval steps must belong to a new amount band created in this save');
      }
    }
    const currencies = config.currencies.map((code: unknown) => String(code).trim().toUpperCase());
    if (currencies.some((code: string) => !/^[A-Z]{3}$/.test(code)) || new Set(currencies).size !== currencies.length) {
      return fail('Currency codes must be unique three-letter codes');
    }
    const baseCurrency = String(config.baseCurrencyCode || '').trim().toUpperCase();
    if (!currencies.includes(baseCurrency)) return fail('Base currency must be included in supported currencies');
    const chartAccounts = config.chartAccounts;
    if (chartAccounts.some((a: any) => !a.id || !a.code?.trim() || !a.name?.trim() ||
      !['asset', 'liability', 'equity', 'income', 'expense'].includes(a.account_type))) {
      return fail('Every chart account requires an ID, code, name and valid account type');
    }
    if (new Set(chartAccounts.map((a: any) => String(a.code).toLowerCase())).size !== chartAccounts.length) {
      return fail('Chart account codes must be unique');
    }
    const chartIds = new Set(chartAccounts.map((a: any) => a.id));
    if (config.financialAccounts.some((a: any) => !scopeMatchesAccountOwner(a))) {
      return fail('Financial accounts must match the requested branch scope');
    }
    if (config.financialAccounts.some((a: any) => !a.id || !a.name?.trim() || !currencies.includes(a.currency_code) ||
      !chartIds.has(a.chart_account_id) || !['cash', 'bank', 'mobile_money', 'clearing'].includes(a.account_type))) {
      return fail('Financial accounts require a name, supported currency, valid chart account and account type');
    }
    if (config.funds.some((fund: any) => !fund.id || !fund.name?.trim() || !fund.code?.trim())) {
      return fail('Every fund requires an ID, code and name');
    }
    if (config.funds.filter((fund: any) => fund.is_default).length > 1) {
      return fail('Only one fund can be marked as the default fund');
    }
    if (config.financialYears.some((year: any) => !year.id || !Number.isInteger(Number(year.year_number)) ||
      year.start_date !== String(year.year_number) + '-01-01' || year.end_date !== String(year.year_number) + '-12-31' ||
      !['open', 'closed'].includes(year.status))) {
      return fail('Financial years must use calendar-year dates and a valid status');
    }
    const yearIds = new Set(config.financialYears.map((year: any) => year.id));
    if (config.periods.some((period: any) => {
      const year = config.financialYears.find((item: any) => item.id === period.financial_year_id);
      return !period.id || !period.name?.trim() || !year ||
        period.start_date > period.end_date || period.start_date < year.start_date ||
        period.end_date > year.end_date || !['open', 'closed'].includes(period.status);
    })) {
      return fail('Every financial period must fit within its financial year and have a valid name, date range and status');
    }
    for (let i = 0; i < config.periods.length; i++) {
      for (let j = i + 1; j < config.periods.length; j++) {
        const a = config.periods[i], b = config.periods[j];
        if (a.financial_year_id === b.financial_year_id && a.start_date <= b.end_date && b.start_date <= a.end_date) {
          return fail('Financial periods in the same year cannot overlap');
        }
      }
    }
    if (config.approvalPolicies.some((policy: any) => !policy.id || !policy.name?.trim() ||
      !['financial_document', 'budget'].includes(policy.transaction_type) || !Number.isInteger(Number(policy.version)) ||
      !policy.effective_from || (policy.effective_to && policy.effective_to < policy.effective_from))) {
      return fail('Approval policies require a name, version, transaction type and valid effective dates');
    }
    const policyIds = new Set(config.approvalPolicies.map((policy: any) => policy.id));
    if (config.approvalPolicyBands.some((band: any) => !band.id || !policyIds.has(band.policy_id) ||
      !Number.isFinite(Number(band.min_amount_base)) || Number(band.min_amount_base) < 0 ||
      (band.max_amount_base != null && Number(band.max_amount_base) <= Number(band.min_amount_base)))) {
      return fail('Approval amount bands must belong to a policy and have a valid amount range');
    }
    for (let i = 0; i < config.approvalPolicyBands.length; i++) {
      for (let j = i + 1; j < config.approvalPolicyBands.length; j++) {
        const a = config.approvalPolicyBands[i], b = config.approvalPolicyBands[j];
        const aMax = a.max_amount_base == null ? Number.POSITIVE_INFINITY : Number(a.max_amount_base);
        const bMax = b.max_amount_base == null ? Number.POSITIVE_INFINITY : Number(b.max_amount_base);
        if (a.policy_id === b.policy_id && Number(a.min_amount_base) < bMax && Number(b.min_amount_base) < aMax) {
          return fail('Approval amount bands for the same policy cannot overlap');
        }
      }
    }
    const bandIds = new Set(config.approvalPolicyBands.map((band: any) => band.id));
    if (config.approvalPolicySteps.some((step: any) => {
      const band = config.approvalPolicyBands.find((item: any) => item.id === step.band_id);
      const policy = config.approvalPolicies.find((item: any) => item.id === band?.policy_id);
      const validCore = step.id && bandIds.has(step.band_id) &&
        Number.isInteger(Number(step.step_number)) && Number(step.step_number) > 0 &&
        Boolean(step.required_permission_key) && Number.isInteger(Number(step.required_approvals)) &&
        Number(step.required_approvals) > 0;
      if (!validCore) return true;
      return false;
    })) {
      return fail('Approval steps require valid scope, order, permission and approval counts');
    }
    state.currencies = currencies;
    state.baseCurrencyCode = baseCurrency;
    state.chartAccounts = clone(chartAccounts);
    state.financialAccounts = [
      ...state.financialAccounts.filter(account => !scopeMatchesAccountOwner(account)),
      ...clone(config.financialAccounts)
    ];
    state.funds = [
      ...state.funds.filter(fund =>
        !submittedFundIds.has(fund.id) && ((fund.branch_id ?? null) !== null || (fund.district_id ?? null) !== null)
      ),
      ...clone(config.funds)
    ];
    state.financialYears = clone(config.financialYears);
    state.periods = clone(config.periods).map((period: any) => ({
      ...period,
      year_status: config.financialYears.find((year: any) => year.id === period.financial_year_id)?.status ?? 'closed'
    }));
    const scopedPolicyIds = new Set(config.approvalPolicies.map((policy: any) => policy.id));
    const scopedBandIds = new Set(config.approvalPolicyBands.map((band: any) => band.id));
    state.approvalPolicies = [
      ...state.approvalPolicies.filter(policy =>
        !scopedPolicyIds.has(policy.id) &&
        ((policy.branch_id ?? null) !== branchId || (policy.district_id ?? null) !== null)),
      ...clone(config.approvalPolicies).map((policy: any) => ({
        ...policy,
        min_amount: Math.min(...config.approvalPolicyBands.filter((band: any) => band.policy_id === policy.id).map((band: any) => Number(band.min_amount_base)), 0),
        max_amount: null,
        approver_profile_ids: config.approvalPolicySteps
          .filter((step: any) => config.approvalPolicyBands.some((band: any) => band.id === step.band_id && band.policy_id === policy.id))
          .flatMap((step: any) => step.approver_profile_ids || [])
      }))
    ];
    state.approvalPolicyBands = [
      ...state.approvalPolicyBands.filter(band => !scopedPolicyIds.has(band.policy_id)),
      ...clone(config.approvalPolicyBands)
    ];
    state.approvalPolicySteps = [
      ...state.approvalPolicySteps.filter(step => !scopedBandIds.has(step.band_id)),
      ...clone(config.approvalPolicySteps)
    ];
    storage.save(state);
    return success({ saved: true });
  }

  function resolveMockPaymentChannelScopeAuth(
    state: MockFinanceState,
    scopeType: string,
    scopeId: string | null,
    requireManage: boolean
  ) {
    const auth = getAuth();
    if (!auth.userId) return { error: fail('Authentication required', '42501') };
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived' && p.record_status !== 'archived');
    if (!actor) return { error: fail('No active member profile is linked to this account', '42501') };
    const scope = resolveMockFinanceScope(state, scopeType, scopeId);
    if ('error' in scope) return { error: fail(scope.error || 'Invalid finance scope') };
    const perms = requireManage ? ['manage_finances'] : ['view_finances', 'manage_finances', 'approve_finances'];
    const allowed = scopeType === 'church'
      ? perms.some(permission => hasPermission(state, actor.id, permission, null))
      : scopeType === 'district'
        ? perms.some(permission => hasDistrictPermission(state, actor.id, permission, scopeId!))
        : perms.some(permission => hasPermission(state, actor.id, permission, scopeId!));
    if (!allowed) {
      return {
        error: fail(
          requireManage
            ? 'Insufficient permission to manage payment channels in this scope'
            : 'Insufficient permission to view payment channels in this scope',
          '42501'
        )
      };
    }
    return { actor, scopeType, scopeId, branchId: scope.branchId, districtId: scope.districtId };
  }

  function getPaymentChannelConfiguration(args: Record<string, any> = {}) {
    const state = storage.load();
    const resolved = resolveMockPaymentChannelScopeAuth(
      state,
      String(args.p_scope_type || ''),
      args.p_scope_id ?? null,
      false
    );
    if ('error' in resolved) return resolved.error;
    const { scopeType, scopeId, branchId, districtId } = resolved;

    const channels = (state.paymentChannels || [])
      .filter(channel => matchesExactScope(channel, scopeType, branchId, districtId))
      .map((channel): Record<string, any> => {
        const account = state.financialAccounts.find(item => item.id === channel.financial_account_id);
        const fund = channel.default_fund_id
          ? state.funds.find(item => item.id === channel.default_fund_id)
          : null;
        return {
          ...clone(channel),
          financial_account_name: account?.name ?? 'Unknown financial account',
          financial_account_type: account?.account_type ?? null,
          currency_code: account?.currency_code ?? state.baseCurrencyCode ?? 'SLE',
          default_fund_name: fund?.name ?? null
        };
      })
      .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0) ||
        String(a.provider_name || '').localeCompare(String(b.provider_name || '')));

    const eligibleFinancialAccounts = state.financialAccounts
      .filter(account => account.is_active &&
        ['bank', 'mobile_money'].includes(account.account_type) &&
        matchesHierarchicalScope(account, scopeType, branchId, districtId))
      .sort((a, b) => Number(b.branch_id != null) - Number(a.branch_id != null) ||
        Number(b.district_id != null) - Number(a.district_id != null) ||
        String(a.name || '').localeCompare(String(b.name || '')));

    const activeFunds = state.funds
      .filter(fund => fund.is_active && matchesHierarchicalScope(fund, scopeType, branchId, districtId))
      .sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)) ||
        String(a.code || '').localeCompare(String(b.code || '')));

    return success({
      scope: { type: scopeType, id: scopeId },
      currencies: clone(state.currencies),
      baseCurrencyCode: state.baseCurrencyCode,
      channels,
      eligibleFinancialAccounts: clone(eligibleFinancialAccounts),
      activeFunds: clone(activeFunds)
    });
  }

  function savePaymentChannel(args: Record<string, any> = {}) {
    const state = clone(storage.load());
    const resolved = resolveMockPaymentChannelScopeAuth(
      state,
      String(args.p_scope_type || ''),
      args.p_scope_id ?? null,
      true
    );
    if ('error' in resolved) return resolved.error;
    const { actor, scopeType, branchId, districtId } = resolved;

    const payload = args.p_channel;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return fail('Payment channel payload must be an object');
    }
    const channelType = String(payload.channel_type || '').trim();
    const providerName = String(payload.provider_name || '').trim();
    const accountName = String(payload.account_name || '').trim();
    const accountNumberOrCode = String(payload.account_number_or_code || '').trim();
    const financialAccountId = String(payload.financial_account_id || '').trim();
    const defaultFundId = payload.default_fund_id ? String(payload.default_fund_id).trim() : null;
    const branchOrSwiftCode = payload.branch_or_swift_code ? String(payload.branch_or_swift_code).trim() : null;
    const instructions = payload.instructions ? String(payload.instructions).trim() : null;
    const verificationMode = payload.verification_mode ? String(payload.verification_mode).trim() : 'manual_proof';
    const displayOrder = payload.display_order == null ? 0 : Number(payload.display_order);
    const isActive = payload.is_active == null ? true : Boolean(payload.is_active);

    if (!['mobile_money', 'bank_transfer'].includes(channelType)) {
      return fail('Channel type must be mobile_money or bank_transfer');
    }
    if (!providerName || !accountName || !accountNumberOrCode) {
      return fail('Provider name, account name and merchant code or account number are required');
    }
    if (!['manual_proof', 'provider_reference'].includes(verificationMode)) {
      return fail('Verification mode must be manual_proof or provider_reference');
    }
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      return fail('Display order must be zero or a positive integer');
    }
    if (!financialAccountId) {
      return fail('An active operational bank or mobile-money financial account is required');
    }

    const account = state.financialAccounts.find(item => item.id === financialAccountId && item.is_active);
    if (!account) {
      return fail('Linked financial account was not found or is inactive');
    }
    if (channelType === 'mobile_money' && account.account_type !== 'mobile_money') {
      return fail('Mobile-money channels must link to a mobile_money financial account');
    }
    if (channelType === 'bank_transfer' && account.account_type !== 'bank') {
      return fail('Bank-transfer channels must link to a bank financial account');
    }
    if (!matchesHierarchicalScope(account, scopeType, branchId, districtId)) {
      return fail('Linked financial account is outside the requested scope');
    }

    if (defaultFundId) {
      const fund = state.funds.find(item => item.id === defaultFundId && item.is_active);
      if (!fund) return fail('Selected default fund was not found or is inactive');
      if (!matchesHierarchicalScope(fund, scopeType, branchId, districtId)) {
        return fail('Selected default fund is outside the requested scope');
      }
    }

    state.paymentChannels = Array.isArray(state.paymentChannels) ? state.paymentChannels : [];
    const requestedId = payload.id ? String(payload.id).trim() : '';
    const existingIndex = requestedId
      ? state.paymentChannels.findIndex(item => item.id === requestedId)
      : -1;
    const nowIso = new Date().toISOString();

    if (existingIndex >= 0) {
      const existing = state.paymentChannels[existingIndex];
      if (!matchesExactScope(existing, scopeType, branchId, districtId)) {
        return fail('Payment channel does not belong to the requested scope', '42501');
      }
      const updated = {
        ...existing,
        financial_account_id: financialAccountId,
        default_fund_id: defaultFundId,
        channel_type: channelType,
        provider_name: providerName,
        account_name: accountName,
        account_number_or_code: accountNumberOrCode,
        branch_or_swift_code: branchOrSwiftCode || null,
        instructions: instructions || null,
        verification_mode: verificationMode,
        display_order: displayOrder,
        is_active: isActive,
        updated_by: actor.id,
        updated_at: nowIso
      };
      state.paymentChannels[existingIndex] = updated;
      storage.save(state);
      return success({ saved: true, channel: clone(updated) });
    }

    const created = {
      id: requestedId || id(state, 'pchan'),
      branch_id: branchId,
      district_id: districtId,
      financial_account_id: financialAccountId,
      default_fund_id: defaultFundId,
      channel_type: channelType,
      provider_name: providerName,
      account_name: accountName,
      account_number_or_code: accountNumberOrCode,
      branch_or_swift_code: branchOrSwiftCode || null,
      instructions: instructions || null,
      verification_mode: verificationMode,
      display_order: displayOrder,
      is_active: isActive,
      created_by: actor.id,
      updated_by: actor.id,
      created_at: nowIso,
      updated_at: nowIso
    };
    state.paymentChannels.push(created);
    storage.save(state);
    return success({ saved: true, channel: clone(created) });
  }

  function setPaymentChannelStatus(args: Record<string, any> = {}) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived' && p.record_status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const channelId = String(args.p_channel_id || '').trim();
    const index = (state.paymentChannels || []).findIndex(item => item.id === channelId);
    if (index < 0) return fail('Payment channel does not exist');

    const existing = state.paymentChannels[index];
    const allowed = hasScopePermission(
      state,
      actor.id,
      'manage_finances',
      existing.branch_id ?? null,
      existing.district_id ?? null
    );
    if (!allowed) return fail('Insufficient permission to update payment channels in this scope', '42501');

    const nextActive = args.p_is_active == null ? true : Boolean(args.p_is_active);
    state.paymentChannels[index] = {
      ...existing,
      is_active: nextActive,
      updated_by: actor.id,
      updated_at: new Date().toISOString()
    };
    storage.save(state);
    return success({ id: existing.id, is_active: nextActive });
  }

  function deletePaymentChannel(args: Record<string, any> = {}) {
    const state = clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived' && p.record_status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const channelId = String(args.p_channel_id || '').trim();
    const index = (state.paymentChannels || []).findIndex(item => item.id === channelId);
    if (index < 0) return fail('Payment channel does not exist');

    const existing = state.paymentChannels[index];
    const allowed = hasScopePermission(
      state,
      actor.id,
      'manage_finances',
      existing.branch_id ?? null,
      existing.district_id ?? null
    );
    if (!allowed) return fail('Insufficient permission to remove payment channels in this scope', '42501');

    state.paymentChannels.splice(index, 1);
    storage.save(state);
    return success({ deleted: true, id: channelId });
  }

  function getMemberGivingChannels(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived' && p.record_status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const branchId = (args.p_branch_id ?? actor.branch_id ?? null) as string | null;
    let districtId: string | null = null;
    if (branchId) {
      const branch = state.branches.find(item => item.id === branchId);
      if (!branch) return fail('Branch does not exist');
      districtId = branch.district_id ?? null;
      const canAccess =
        actor.branch_id === branchId ||
        state.permissions.some(p =>
          p.profile_id === actor.id &&
          ((p.branch_id == null && p.district_id == null) ||
           (districtId != null && p.district_id === districtId) ||
           p.branch_id === branchId)
        );
      if (!canAccess) return fail('Insufficient permission to view giving channels for this branch', '42501');
    }

    const scopeType = branchId ? 'branch' : 'church';
    const channels = (state.paymentChannels || [])
      .filter(channel => {
        if (!channel.is_active) return false;
        const account = state.financialAccounts.find(item => item.id === channel.financial_account_id);
        if (!account || !account.is_active) return false;
        return matchesHierarchicalScope(channel, scopeType, branchId, districtId);
      })
      .map(channel => {
        const account = state.financialAccounts.find(item => item.id === channel.financial_account_id);
        const fund = channel.default_fund_id
          ? state.funds.find(item => item.id === channel.default_fund_id)
          : null;
        return {
          id: channel.id,
          scope_type: channel.branch_id ? 'branch' : channel.district_id ? 'district' : 'church',
          branch_id: channel.branch_id ?? null,
          district_id: channel.district_id ?? null,
          channel_type: channel.channel_type,
          provider_name: channel.provider_name,
          account_name: channel.account_name,
          account_number_or_code: channel.account_number_or_code,
          branch_or_swift_code: channel.branch_or_swift_code ?? null,
          instructions: channel.instructions ?? null,
          currency_code: account?.currency_code ?? state.baseCurrencyCode ?? 'SLE',
          default_fund_id: channel.default_fund_id ?? null,
          default_fund_name: fund?.name ?? null,
          verification_mode: channel.verification_mode ?? 'manual_proof',
          display_order: channel.display_order ?? 0
        };
      })
      .sort((a, b) =>
        Number(b.branch_id != null) - Number(a.branch_id != null) ||
        Number(b.district_id != null) - Number(a.district_id != null) ||
        Number(a.display_order || 0) - Number(b.display_order || 0) ||
        String(a.provider_name || '').localeCompare(String(b.provider_name || '')));

    const funds = state.funds
      .filter(fund => fund.is_active && matchesHierarchicalScope(fund, scopeType, branchId, districtId))
      .map(fund => ({
        id: fund.id,
        name: fund.name,
        code: fund.code,
        description: fund.description ?? null,
        fund_type: fund.fund_type,
        is_default: Boolean(fund.is_default)
      }))
      .sort((a, b) => Number(b.is_default) - Number(a.is_default) || String(a.code || '').localeCompare(String(b.code || '')));

    return success({
      branch_id: branchId,
      currencies: clone(state.currencies),
      baseCurrencyCode: state.baseCurrencyCode,
      channels,
      funds
    });
  }

  return {
    async rpc(name: string, args: Record<string, any> = {}) {
      try {
        if (name === 'get_my_finance_scopes') return getMyFinanceScopes();
        if (name === 'get_finance_configuration') return getFinanceConfiguration(args);
        if (name === 'get_finance_scope_configuration') return getFinanceScopeConfiguration(args);
        if (name === 'get_finance_scope_transaction_options') return getFinanceScopeTransactionOptions(args);
        if (name === 'save_finance_scope_resources') return saveFinanceScopeResources(args);
        if (name === 'save_finance_scope_approval_policies') return saveFinanceScopeApprovalPolicies(args);
        if (name === 'get_payment_channel_configuration') return getPaymentChannelConfiguration(args);
        if (name === 'save_payment_channel') return savePaymentChannel(args);
        if (name === 'set_payment_channel_status') return setPaymentChannelStatus(args);
        if (name === 'delete_payment_channel') return deletePaymentChannel(args);
        if (name === 'get_member_giving_channels') return getMemberGivingChannels(args);
        if (name === 'get_requisition_approval_configuration') return getRequisitionApprovalConfiguration(args);
        if (name === 'get_department_requisitions') return getDepartmentRequisitions(args);
        if (name === 'get_department_requisition_submission_options') return getDepartmentRequisitionSubmissionOptions(args);
        if (name === 'submit_department_requisition') return submitDepartmentRequisition(args);
        if (name === 'decide_department_requisition_approval') return decideDepartmentRequisitionApproval(args);
        if (name === 'create_department_requisition_payment') return createDepartmentRequisitionPayment(args);
        if (name === 'get_department_requisition_payment_summary') return getDepartmentRequisitionPaymentSummary(args);
        if (name === 'save_requisition_approval_policy') return saveRequisitionApprovalPolicy(args);
        if (name === 'submit_event_budget_for_approval') return submitEventBudgetForApproval(args);
        if (name === 'get_event_budget_submission_options') return getEventBudgetSubmissionOptions(args);
        if (name === 'get_my_event_budgets') return getMyEventBudgets(args);
        if (name === 'decide_event_budget_approval') return decideEventBudgetApproval(args);
        if (name === 'create_event_budget_payment') return createEventBudgetPayment(args);
        if (name === 'get_event_budgets') return getEventBudgets(args);
        if (name === 'set_finance_branch_clearing_accounts') return setFinanceBranchClearingAccounts(args);
        if (name === 'get_finance_branch_clearing_accounts') return getFinanceBranchClearingAccounts(args);
        if (name === 'create_financial_transfer') return createFinancialTransfer(args);
        if (name === 'decide_financial_transfer_approval') return decideFinancialTransferApproval(args);
        if (name === 'post_financial_transfer') return postFinancialTransfer(args);
        if (name === 'get_financial_transfers') return getFinancialTransfers(args);
        if (name === 'get_finance_transfer_reconciliation') return getFinanceTransferReconciliation(args);
        if (name === 'get_finance_documents') return getFinanceDocuments(args);
        if (name === 'get_finance_scope_documents') return getFinanceScopeDocuments(args);
        if (name === 'get_finance_journals') return getFinanceJournals(args);
        if (name === 'get_finance_scope_journals') return getFinanceScopeJournals(args);
        if (name === 'post_finance_journal_entry') return postJournalEntry(args);
        if (name === 'save_finance_configuration') return saveFinanceConfiguration(args);
        if (name === 'create_financial_document_transaction_idempotent') return createTransaction(args);
        if (name === 'create_finance_scope_document_transaction') return createFinanceScopeDocumentTransaction(args);
        if (name === 'decide_financial_document_approval') return decideApproval(args);
        if (name === 'post_journal_entry') return postJournalEntry(args);
        return fail(`Mock RPC function not implemented: ${name}`);
      } catch (error) {
        return fail(error instanceof Error ? error.message : 'Mock finance operation failed');
      }
    }
  };
}

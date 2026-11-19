export type MockFinanceDocumentType = 'receipt' | 'payment';
export type MockFinanceDecision = 'approved' | 'rejected';

export interface MockFinanceState {
  profiles: Array<{ id: string; auth_user_id: string | null; status?: string }>;
  permissions: Array<{ profile_id: string; permission: string; branch_id: string | null }>;
  currencies: string[];
  baseCurrencyCode: string | null;
  financialAccounts: Array<{ id: string; branch_id: string | null; currency_code: string; is_active: boolean; chart_account_id: string; [key: string]: any }>;
  chartAccounts: Array<{ id: string; is_active: boolean; account_type: string; is_control_account?: boolean; [key: string]: any }>;
  funds: Array<{ id: string; is_active: boolean; [key: string]: any }>;
  periods: Array<{ id: string; start_date: string; end_date: string; status: string; year_status: string; [key: string]: any }>;
  financialYears: Array<Record<string, any>>;
  approvalPolicyBands: Array<Record<string, any>>;
  approvalPolicySteps: Array<Record<string, any>>;
  events: Array<{ id: string; branch_id: string; name?: string; title?: string; [key: string]: any }>;
  budgets: Array<Record<string, any>>;
  budgetLines: Array<Record<string, any>>;
  approvalPolicies: Array<{
    id: string; is_active: boolean; transaction_type: 'financial_document' | 'budget';
    branch_id: string | null; min_amount: number; max_amount: number | null;
    approver_profile_ids: string[];
  }>;
  documents: Array<Record<string, any>>;
  journals: Array<Record<string, any>>;
  journalLines: Array<Record<string, any>>;
  approvalRequests: Array<Record<string, any>>;
  approvalSteps: Array<Record<string, any>>;
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
      parsed.events = Array.isArray(parsed.events) ? parsed.events : [];
      parsed.budgets = Array.isArray(parsed.budgets) ? parsed.budgets : [];
      parsed.budgetLines = Array.isArray(parsed.budgetLines) ? parsed.budgetLines : [];
      return parsed;
    },
    save(state) { storage.setItem(key, JSON.stringify(state)); }
  };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (message: string, code = '22023') => ({ data: null, error: { code, message } });
const success = <T>(data: T) => ({ data, error: null });
const round4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function createEmptyMockFinanceState(): MockFinanceState {
  return {
    profiles: [], permissions: [], currencies: [], baseCurrencyCode: null,
    financialAccounts: [], chartAccounts: [], funds: [], periods: [], financialYears: [],
    approvalPolicyBands: [], approvalPolicySteps: [], approvalPolicies: [], events: [], budgets: [], budgetLines: [],
    documents: [], journals: [], journalLines: [], approvalRequests: [], approvalSteps: [], nextId: 1
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
  const hasPermission = (state: MockFinanceState, profileId: string, permission: string, branchId: string | null) =>
    state.permissions.some(p => p.profile_id === profileId && p.permission === permission &&
      (p.branch_id === null || p.branch_id === branchId));

  function createTransaction(args: Record<string, any>, stateOverride?: MockFinanceState, persist = true) {
    const state = stateOverride ?? clone(storage.load());
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');

    const type = args.p_document_type as MockFinanceDocumentType;
    const branchId = args.p_branch_id;
    if (!hasPermission(state, actor.id, 'manage_finances', branchId)) {
      return fail('Insufficient permission to create financial transactions in this branch', '42501');
    }
    const amount = Number(args.p_amount);
    const rate = Number(args.p_exchange_rate_to_base ?? 1);
    const date = args.p_transaction_date;
    const currency = String(args.p_currency_code || '').trim().toUpperCase();
    const party = String(args.p_party_name || '').trim();
    const description = String(args.p_description || '').trim();
    const method = args.p_payment_method;
    if (!['receipt', 'payment'].includes(type)) return fail('Only receipt and payment transactions can be created here');
    if (!date || !Number.isFinite(Date.parse(date)) || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isFinite(rate) || rate <= 0) return fail('Transaction date, positive amount and positive exchange rate are required');
    if (currency.length !== 3 || !state.currencies.includes(currency)) return fail('A valid transaction currency is required');
    if (!party || !description) return fail('Counterparty name and description are required');
    if (!['cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other'].includes(method)) return fail('Unsupported payment method');
    if (!state.baseCurrencyCode) return fail('Church settings must be configured before financial operations');
    if (currency === state.baseCurrencyCode && rate !== 1) return fail('Exchange rate must be 1 for the base currency');
    if (args.p_profile_id && !state.profiles.some(p => p.id === args.p_profile_id)) return fail('Selected member profile does not exist');
    const financialAccount = state.financialAccounts.find(a => a.id === args.p_financial_account_id &&
      a.is_active && a.currency_code === currency && (a.branch_id === null || a.branch_id === branchId));
    if (!financialAccount) return fail('Financial account is inactive or incompatible with transaction branch/currency');
    const cashAccount = state.chartAccounts.find(a => a.id === financialAccount.chart_account_id && a.is_active && a.account_type === 'asset');
    if (!cashAccount) return fail('Financial account must link to an active asset chart account');
    const expectedCategory = type === 'receipt' ? 'income' : 'expense';
    const category = state.chartAccounts.find(a => a.id === args.p_category_account_id && a.is_active &&
      !a.is_control_account && a.account_type === expectedCategory);
    if (!category) return fail('Selected category must be an active, non-control account of the correct type');
    if (args.p_fund_id && !state.funds.some(f => f.id === args.p_fund_id && f.is_active)) return fail('Selected fund is inactive or does not exist');
    const period = state.periods.find(p => p.status === 'open' && p.year_status === 'open' && date >= p.start_date && date <= p.end_date);
    if (!period) return fail('No open financial period and year exist for the transaction date');

    const baseAmount = round4(amount * rate);
    const policy = state.approvalPolicies.find(p => {
      if (!p.is_active || p.transaction_type !== 'financial_document' ||
          (p.branch_id !== null && p.branch_id !== branchId) ||
          (p.effective_from && date < p.effective_from) ||
          (p.effective_to && date > p.effective_to)) return false;
      const bands = state.approvalPolicyBands.filter(b => b.policy_id === p.id);
      return bands.length
        ? bands.some(b => baseAmount >= Number(b.min_amount_base) &&
            (b.max_amount_base == null || baseAmount < Number(b.max_amount_base)))
        : baseAmount >= p.min_amount && (p.max_amount === null || baseAmount <= p.max_amount);
    });
    if (!policy) return fail('No active approval policy covers this financial document amount');
    const selectedBand = state.approvalPolicyBands.find(b => b.policy_id === policy.id &&
      baseAmount >= Number(b.min_amount_base) &&
      (b.max_amount_base == null || baseAmount < Number(b.max_amount_base)));
    const configuredApprovers = selectedBand
      ? state.approvalPolicySteps.filter(s => s.band_id === selectedBand.id)
          .sort((a, b) => Number(a.step_number) - Number(b.step_number))
          .flatMap(s => s.approver_profile_ids || [])
      : policy.approver_profile_ids;
    if (!configuredApprovers.length) return fail('Approval policy has no configured approvers');

    const documentId = id(state, 'doc');
    const journalId = id(state, 'journal');
    const requestId = id(state, 'approval');
    const docStatus = 'pending_approval';
    const document = {
      id: documentId, document_type: type, transaction_date: date, branch_id: branchId,
      profile_id: args.p_profile_id ?? null, payee_or_payer_name: party, amount, currency_code: currency,
      payment_method: method, financial_account_id: financialAccount.id, fund_id: args.p_fund_id ?? null,
      external_reference: String(args.p_external_reference || '').trim() || null,
      description, status: docStatus, created_by_profile_id: actor.id, approval_request_id: requestId,
      exchange_rate_to_base: rate, base_currency_code: state.baseCurrencyCode, journal_entry_id: null
    };
    const journal = {
      id: journalId, period_id: period.id, branch_id: branchId, entry_date: date,
      description, reference: document.external_reference, currency_code: currency,
      exchange_rate_to_base: rate, base_currency_code: state.baseCurrencyCode,
      source_type: 'financial_document_pending', source_id: documentId, status: 'draft'
    };
    const debitAccount = type === 'receipt' ? cashAccount.id : category.id;
    const creditAccount = type === 'receipt' ? category.id : cashAccount.id;
    const lines = [
      { id: id(state, 'line'), journal_entry_id: journalId, line_number: 1, account_id: debitAccount,
        fund_id: type === 'payment' ? args.p_fund_id ?? null : null, branch_id: branchId,
        profile_id: args.p_profile_id ?? null, description, debit_amount: amount, credit_amount: 0,
        base_debit_amount: baseAmount, base_credit_amount: 0 },
      { id: id(state, 'line'), journal_entry_id: journalId, line_number: 2, account_id: creditAccount,
        fund_id: type === 'receipt' ? args.p_fund_id ?? null : null, branch_id: branchId,
        profile_id: args.p_profile_id ?? null, description, debit_amount: 0, credit_amount: amount,
        base_debit_amount: 0, base_credit_amount: baseAmount }
    ];
    const request = { id: requestId, transaction_type: 'financial_document', target_id: documentId, status: 'pending', policy_id: policy.id };
    const steps = configuredApprovers.map((profileId, index) => ({
      id: id(state, 'step'), approval_request_id: requestId, step_order: index + 1,
      approver_profile_id: profileId, status: 'pending', decision: null, comments: null
    }));
    state.documents.push(document); state.journals.push(journal); state.journalLines.push(...lines);
    state.approvalRequests.push(request); state.approvalSteps.push(...steps);
    if (persist) storage.save(state);
    return success({ document_id: documentId, journal_entry_id: journalId, approval_request_id: requestId, status: docStatus });
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
    if (step.approver_profile_id !== actor.id || !hasPermission(state, actor.id, 'approve_finances', document.branch_id)) {
      return fail('You are not authorized to decide this approval step', '42501');
    }
    if (!['approved', 'rejected'].includes(args.p_decision)) return fail('Approval decision must be approved or rejected');
    const earlierPendingStep = state.approvalSteps.some(s => s.approval_request_id === request.id &&
      s.step_order < step.step_order && s.status === 'pending');
    if (earlierPendingStep) return fail('Earlier approval steps must be completed first');
    step.decision = args.p_decision; step.comments = String(args.p_comments || '').trim() || null;
    step.status = args.p_decision;
    if (args.p_decision === 'rejected') {
      request.status = 'rejected'; document.status = 'rejected';
      return persistDecision(state, request, document, null);
    }
    const nextStep = state.approvalSteps.find(s => s.approval_request_id === request.id && s.step_order > step.step_order);
    if (nextStep) return persistDecision(state, request, document, null);
    request.status = 'approved'; document.status = 'approved';
    const journal = state.journals.find(j => j.source_type === 'financial_document_pending' && j.source_id === document.id && j.status === 'draft');
    if (!journal) return fail('Approved financial document has no matching pending journal');
    journal.source_type = 'financial_document'; document.journal_entry_id = journal.id;
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
    if (!branchId || !hasPermission(state, actor.id, 'manage_finances', branchId)) {
      return fail('Insufficient permission to submit an event budget for this branch', '42501');
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
    const approvers = [];
    for (const policyStep of policySteps) {
      const permission = policyStep.required_permission_key || 'approve_finances';
      const ids = policyStep.approver_profile_ids || [];
      if (ids.length < Number(policyStep.required_approvals || 1)) {
        return fail('Event budget approval step does not have enough configured approvers');
      }
      for (const profileId of ids) {
        const profile = state.profiles.find(item => item.id === profileId && item.status !== 'suspended' && item.status !== 'archived');
        if (!profile || !hasPermission(state, profileId, permission, branchId)) {
          return fail('Every event budget approver must be active and hold the required branch permission', '42501');
        }
        approvers.push({ profileId, stepOrder: Number(policyStep.step_number), permission });
      }
    }
    if (!approvers.length || new Set(approvers.map(item => item.profileId + ':' + item.stepOrder)).size !== approvers.length) {
      return fail('Event budget approval policy has invalid or duplicate approvers');
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
    const steps = approvers.map(item => ({
      id: id(state, 'step'), approval_request_id: requestId, step_order: item.stepOrder,
      approver_profile_id: item.profileId, required_permission_key: item.permission,
      required_approvals: Number(policySteps.find(policyStep => Number(policyStep.step_number) === item.stepOrder)?.required_approvals || 1),
      prohibit_submitter_approval: Boolean(policySteps.find(policyStep => Number(policyStep.step_number) === item.stepOrder)?.prohibit_submitter_approval),
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
    const requiredPermission = step.required_permission_key || 'approve_finances';
    if (step.approver_profile_id !== actor.id || !hasPermission(state, actor.id, requiredPermission, budget.branch_id)) {
      return fail('You are not authorized to decide this event budget approval step', '42501');
    }
    if (step.prohibit_submitter_approval && request.submitted_by_profile_id === actor.id) {
      return fail('The budget submitter cannot approve their own event budget', '42501');
    }
    if (!['approved', 'rejected'].includes(args.p_decision)) return fail('Approval decision must be approved or rejected');
    const priorSteps = state.approvalSteps.filter(item => item.approval_request_id === request.id && item.step_order < step.step_order);
    const priorGroups = [...new Set(priorSteps.map(item => item.step_order))];
    if (priorGroups.some(order => {
      const group = priorSteps.filter(item => item.step_order === order);
      return group.filter(item => item.status === 'approved').length < Number(group[0]?.required_approvals || 1);
    })) return fail('Earlier approval steps must be completed first');
    step.decision = args.p_decision;
    step.comments = String(args.p_comments || '').trim() || null;
    step.status = args.p_decision;
    if (args.p_decision === 'rejected') {
      request.status = 'rejected';
      budget.status = 'rejected';
    } else {
      const currentGroup = state.approvalSteps.filter(item => item.approval_request_id === request.id && item.step_order === step.step_order);
      const currentGroupComplete = currentGroup.filter(item => item.status === 'approved').length >= Number(step.required_approvals || 1);
      const nextPending = state.approvalSteps.some(item => item.approval_request_id === request.id &&
        item.step_order > step.step_order && item.status === 'pending');
      if (currentGroupComplete && !nextPending) {
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
      p_exchange_rate_to_base: rate
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
      return { ...clone(budget), lines, payment_document: document ? clone(document) : null,
        posted_journal_entry_id: journal?.id ?? null, total_actual: round4(actual) };
    }) });
  }

  function getFinanceConfiguration() {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    if (!state.permissions.some(p => p.profile_id === actor.id &&
      ['view_finances', 'manage_finances', 'manage_chart_of_accounts', 'manage_financial_periods', 'approve_finances'].includes(p.permission))) {
      return fail('Insufficient permission to view finance configuration', '42501');
    }
    return success({
      currencies: clone(state.currencies), baseCurrencyCode: state.baseCurrencyCode,
      chartAccounts: clone(state.chartAccounts), financialAccounts: clone(state.financialAccounts),
      funds: clone(state.funds), financialYears: clone(state.financialYears), periods: clone(state.periods),
      approvalPolicies: clone(state.approvalPolicies), approvalPolicyBands: clone(state.approvalPolicyBands),
      approvalPolicySteps: clone(state.approvalPolicySteps)
    });
  }

  function getFinanceDocuments(args: Record<string, any> = {}) {
    const state = storage.load();
    const auth = getAuth();
    if (!auth.userId) return fail('Authentication required', '42501');
    const actor = state.profiles.find(p => p.auth_user_id === auth.userId && p.status !== 'suspended' && p.status !== 'archived');
    if (!actor) return fail('No active member profile is linked to this account', '42501');
    const requestedBranch = args.p_branch_id ?? null;
    const canView = (branchId: string) =>
      hasPermission(state, actor.id, 'view_finances', branchId) ||
      hasPermission(state, actor.id, 'manage_finances', branchId) ||
      hasPermission(state, actor.id, 'approve_finances', branchId);
    const visible = state.documents.filter(document =>
      (!requestedBranch || document.branch_id === requestedBranch) && canView(document.branch_id)
    );
    return success({
      actor_profile_id: actor.id,
      documents: visible.map(document => {
        const request = state.approvalRequests.find(item => item.id === document.approval_request_id);
        const steps = state.approvalSteps.filter(step => step.approval_request_id === request?.id)
          .sort((a, b) => Number(a.step_order) - Number(b.step_order));
        const actorStep = steps.find(step => step.approver_profile_id === actor.id && step.status === 'pending' &&
          hasPermission(state, actor.id, 'approve_finances', document.branch_id));
        return {
          ...clone(document),
          approval_request_id: request?.id ?? null,
          approval_status: request?.status ?? null,
          approval_steps: steps.map(step => ({
            id: step.id, step_order: step.step_order, approver_profile_id: step.approver_profile_id,
            status: step.status, decision: step.decision, comments: step.comments
          })),
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
    if (!hasPermission(state, actor.id, 'post_journals', journal.branch_id ?? null)) {
      return fail('Insufficient permission to post journals', '42501');
    }
    if (journal.status === 'posted') {
      return success({ journal_entry_id: journal.id, status: 'posted', already_posted: true });
    }
    if (journal.status !== 'draft') return fail('Only draft journal entries can be posted');
    if (journal.source_type === 'financial_document_pending') {
      return fail('A financial-document journal cannot be posted before approval and linkage');
    }
    if (journal.source_type === 'financial_document') {
      const document = state.documents.find(item => item.id === journal.source_id);
      if (!document || document.status !== 'approved' || document.journal_entry_id !== journal.id) {
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
    const debits = lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0);
    const credits = lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0);
    const baseDebits = lines.reduce((sum, line) => sum + Number(line.base_debit_amount || 0), 0);
    const baseCredits = lines.reduce((sum, line) => sum + Number(line.base_credit_amount || 0), 0);
    if (debits !== credits) return fail('Journal is not balanced in transaction currency');
    if (baseDebits !== baseCredits) return fail('Journal is not balanced in base currency');

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
      .map(journal => {
        const document = ['financial_document', 'financial_document_pending'].includes(journal.source_type)
          ? state.documents.find(item => item.id === journal.source_id)
          : null;
        const lines = state.journalLines.filter(line => line.journal_entry_id === journal.id)
          .sort((a, b) => Number(a.line_number) - Number(b.line_number))
          .map(line => {
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
          && hasPermission(state, actor.id, 'post_journals', journal.branch_id ?? null)
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
    const canManageFinance = hasPermission(state, actor.id, 'manage_finances', branchId);
    const chartChanged = JSON.stringify([state.currencies, state.baseCurrencyCode, state.chartAccounts, state.financialAccounts, state.funds]) !==
      JSON.stringify([config.currencies, config.baseCurrencyCode, config.chartAccounts, config.financialAccounts, config.funds]);
    const periodsChanged = JSON.stringify([state.financialYears, state.periods]) !==
      JSON.stringify([config.financialYears, config.periods]);
    const approvalsChanged = JSON.stringify([state.approvalPolicies, state.approvalPolicyBands, state.approvalPolicySteps]) !==
      JSON.stringify([config.approvalPolicies, config.approvalPolicyBands, config.approvalPolicySteps]);
    if ((chartChanged && !canManageFinance && !hasPermission(state, actor.id, 'manage_chart_of_accounts', branchId)) ||
        (periodsChanged && !canManageFinance && !hasPermission(state, actor.id, 'manage_financial_periods', branchId)) ||
        (approvalsChanged && !canManageFinance && !hasPermission(state, actor.id, 'approve_finances', branchId))) {
      return fail('Insufficient permission for one or more changed finance configuration areas', '42501');
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
    if (config.approvalPolicySteps.some((step: any) => !step.id || !bandIds.has(step.band_id) ||
      !Number.isInteger(Number(step.step_number)) || Number(step.step_number) < 1 ||
      !step.required_permission_key || !Number.isInteger(Number(step.required_approvals)) ||
      Number(step.required_approvals) < 1 || !Array.isArray(step.approver_profile_ids) ||
      Number(step.required_approvals) > step.approver_profile_ids.length)) {
      return fail('Approval steps require a valid band, order, permission, approval count and sufficient approvers');
    }
    for (const step of config.approvalPolicySteps) {
      const band = config.approvalPolicyBands.find((item: any) => item.id === step.band_id);
      const policy = config.approvalPolicies.find((item: any) => item.id === band?.policy_id);
      const scope = policy?.branch_id ?? branchId;
      if (new Set(step.approver_profile_ids).size !== step.approver_profile_ids.length ||
          step.approver_profile_ids.some((profileId: string) =>
            !state.profiles.some(profile => profile.id === profileId && profile.status !== 'suspended' && profile.status !== 'archived') ||
            !hasPermission(state, profileId, step.required_permission_key, scope))) {
        return fail('Every approval step approver must be active and hold its required permission in the policy scope');
      }
    }
    state.currencies = currencies;
    state.baseCurrencyCode = baseCurrency;
    state.chartAccounts = clone(chartAccounts);
    state.financialAccounts = clone(config.financialAccounts);
    state.funds = clone(config.funds);
    state.financialYears = clone(config.financialYears);
    state.periods = clone(config.periods).map((period: any) => ({
      ...period,
      year_status: config.financialYears.find((year: any) => year.id === period.financial_year_id)?.status ?? 'closed'
    }));
    state.approvalPolicies = clone(config.approvalPolicies).map((policy: any) => ({
      ...policy,
      min_amount: Math.min(...config.approvalPolicyBands.filter((band: any) => band.policy_id === policy.id).map((band: any) => Number(band.min_amount_base)), 0),
      max_amount: null,
      approver_profile_ids: config.approvalPolicySteps
        .filter((step: any) => config.approvalPolicyBands.some((band: any) => band.id === step.band_id && band.policy_id === policy.id))
        .flatMap((step: any) => step.approver_profile_ids)
    }));
    state.approvalPolicyBands = clone(config.approvalPolicyBands);
    state.approvalPolicySteps = clone(config.approvalPolicySteps);
    storage.save(state);
    return success({ saved: true });
  }

  return {
    async rpc(name: string, args: Record<string, any> = {}) {
      try {
        if (name === 'get_finance_configuration') return getFinanceConfiguration();
        if (name === 'submit_event_budget_for_approval') return submitEventBudgetForApproval(args);
        if (name === 'decide_event_budget_approval') return decideEventBudgetApproval(args);
        if (name === 'create_event_budget_payment') return createEventBudgetPayment(args);
        if (name === 'get_event_budgets') return getEventBudgets(args);
        if (name === 'get_finance_documents') return getFinanceDocuments(args);
        if (name === 'get_finance_journals') return getFinanceJournals(args);
        if (name === 'post_finance_journal_entry') return postJournalEntry(args);
        if (name === 'save_finance_configuration') return saveFinanceConfiguration(args);
        if (name === 'create_financial_document_transaction') return createTransaction(args);
        if (name === 'decide_financial_document_approval') return decideApproval(args);
        if (name === 'post_journal_entry') return postJournalEntry(args);
        return fail(`Mock RPC function not implemented: ${name}`);
      } catch (error) {
        return fail(error instanceof Error ? error.message : 'Mock finance operation failed');
      }
    }
  };
}

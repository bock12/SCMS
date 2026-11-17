export type MockFinanceDocumentType = 'receipt' | 'payment';
export type MockFinanceDecision = 'approved' | 'rejected';

export interface MockFinanceState {
  profiles: Array<{ id: string; auth_user_id: string | null; status?: string }>;
  permissions: Array<{ profile_id: string; permission: string; branch_id: string | null }>;
  currencies: string[];
  baseCurrencyCode: string | null;
  financialAccounts: Array<{ id: string; branch_id: string | null; currency_code: string; is_active: boolean; chart_account_id: string }>;
  chartAccounts: Array<{ id: string; is_active: boolean; account_type: string; is_control_account?: boolean }>;
  funds: Array<{ id: string; is_active: boolean }>;
  periods: Array<{ id: string; start_date: string; end_date: string; status: string; year_status: string }>;
  approvalPolicies: Array<{
    id: string; is_active: boolean; transaction_type: 'financial_document';
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

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (message: string, code = '22023') => ({ data: null, error: { code, message } });
const success = <T>(data: T) => ({ data, error: null });
const round4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function createEmptyMockFinanceState(): MockFinanceState {
  return {
    profiles: [], permissions: [], currencies: [], baseCurrencyCode: null,
    financialAccounts: [], chartAccounts: [], funds: [], periods: [],
    approvalPolicies: [], documents: [], journals: [], journalLines: [],
    approvalRequests: [], approvalSteps: [], nextId: 1
  };
}

/**
 * Deterministic, isolated implementation of the two financial-document RPCs.
 * State is only committed after a complete operation succeeds. Supply a storage
 * adapter to persist it; no legacy FinancialRecord data is read or modified.
 */
export function createMockFinanceRpc(
  storage: MockFinanceStorage,
  getAuth: () => MockFinanceAuth
) {
  const id = (state: MockFinanceState, prefix: string) => `${prefix}-${state.nextId++}`;
  const hasPermission = (state: MockFinanceState, profileId: string, permission: string, branchId: string) =>
    state.permissions.some(p => p.profile_id === profileId && p.permission === permission &&
      (p.branch_id === null || p.branch_id === branchId));

  function createTransaction(args: Record<string, any>) {
    const state = clone(storage.load());
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

    const policy = state.approvalPolicies.find(p => p.is_active && p.transaction_type === 'financial_document' &&
      (p.branch_id === null || p.branch_id === branchId) && amount >= p.min_amount &&
      (p.max_amount === null || amount <= p.max_amount));
    if (!policy) return fail('No active approval policy covers this financial document amount');
    if (!policy.approver_profile_ids.length) return fail('Approval policy has no configured approvers');

    const documentId = id(state, 'doc');
    const journalId = id(state, 'journal');
    const requestId = id(state, 'approval');
    const baseAmount = round4(amount * rate);
    const docStatus = 'pending_approval';
    const document = {
      id: documentId, document_type: type, transaction_date: date, branch_id: branchId,
      profile_id: args.p_profile_id ?? null, payee_or_payer_name: party, amount, currency_code: currency,
      payment_method: method, financial_account_id: financialAccount.id, fund_id: args.p_fund_id ?? null,
      external_reference: String(args.p_external_reference || '').trim() || null,
      description, status: docStatus, created_by_profile_id: actor.id,
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
    const steps = policy.approver_profile_ids.map((profileId, index) => ({
      id: id(state, 'step'), approval_request_id: requestId, step_order: index + 1,
      approver_profile_id: profileId, status: 'pending', decision: null, comments: null
    }));
    state.documents.push(document); state.journals.push(journal); state.journalLines.push(...lines);
    state.approvalRequests.push(request); state.approvalSteps.push(...steps);
    storage.save(state);
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

  return {
    async rpc(name: string, args: Record<string, any> = {}) {
      try {
        if (name === 'create_financial_document_transaction') return createTransaction(args);
        if (name === 'decide_financial_document_approval') return decideApproval(args);
        if (name === 'post_journal_entry') {
          const state = storage.load();
          const journal = state.journals.find(j => j.id === args.p_journal_entry_id);
          if (journal?.source_type === 'financial_document_pending') {
            return fail('A financial-document journal cannot be posted before approval and linkage');
          }
        }
        return fail(`Mock RPC function not implemented: ${name}`);
      } catch (error) {
        return fail(error instanceof Error ? error.message : 'Mock finance operation failed');
      }
    }
  };
}

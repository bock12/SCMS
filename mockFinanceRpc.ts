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
    approvalPolicyBands: [], approvalPolicySteps: [], approvalPolicies: [], documents: [], journals: [], journalLines: [],
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
      policy.transaction_type !== 'financial_document' || !Number.isInteger(Number(policy.version)) ||
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
        if (name === 'get_finance_documents') return getFinanceDocuments(args);
        if (name === 'save_finance_configuration') return saveFinanceConfiguration(args);
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

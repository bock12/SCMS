import { describe, expect, test } from 'bun:test';
import { createEmptyMockFinanceState, createMockFinanceRpc, type MockFinanceState } from './mockFinanceRpc';
import { createScopedFinancialDocumentTransaction } from './financeTransactionService';
import {
  filterPendingFinanceDocuments,
  getScopedFinanceWorkflowDocuments,
  submitFinanceApprovalDecision,
  summarizePendingFinanceDocuments,
  validateApprovalDecisionReason,
  type FinanceWorkflowDocument
} from './financeDocumentWorkflowService';

function createWorkflowState(options?: { twoStep?: boolean }): MockFinanceState {
  return {
    ...createEmptyMockFinanceState(),
    profiles: [
      { id: 'officer', auth_user_id: 'user-officer', branch_id: 'branch-1' },
      { id: 'viewer', auth_user_id: 'user-viewer', branch_id: 'branch-1' },
      { id: 'approver-1', auth_user_id: 'user-approver-1', branch_id: 'branch-1' },
      { id: 'approver-2', auth_user_id: 'user-approver-2', branch_id: 'branch-1' }
    ],
    permissions: [
      { profile_id: 'officer', permission: 'manage_finances', branch_id: 'branch-1' },
      { profile_id: 'officer', permission: 'view_finances', branch_id: 'branch-1' },
      { profile_id: 'officer', permission: 'post_journals', branch_id: 'branch-1' },
      { profile_id: 'viewer', permission: 'view_finances', branch_id: 'branch-1' },
      { profile_id: 'approver-1', permission: 'approve_finances', branch_id: 'branch-1' },
      { profile_id: 'approver-2', permission: 'approve_finances', branch_id: 'branch-1' }
    ],
    districts: [{ id: 'district-1', name: 'Western District', status: 'active' }],
    branches: [{ id: 'branch-1', district_id: 'district-1', name: 'Main Branch', status: 'active' }],
    currencies: ['SLE', 'USD'],
    baseCurrencyCode: 'SLE',
    chartAccounts: [
      { id: 'cash-chart', code: '1010', name: 'Cash on Hand', account_type: 'asset', normal_balance: 'debit', is_active: true },
      { id: 'income-chart', code: '4000', name: 'Tithes & Offerings', account_type: 'income', normal_balance: 'credit', is_active: true },
      { id: 'expense-chart', code: '5000', name: 'Utilities', account_type: 'expense', normal_balance: 'debit', is_active: true }
    ],
    financialAccounts: [
      { id: 'cash-1', branch_id: 'branch-1', district_id: 'district-1', name: 'Main Cash', account_type: 'cash', currency_code: 'SLE', is_active: true, chart_account_id: 'cash-chart' }
    ],
    funds: [{ id: 'fund-1', code: 'GEN', name: 'General Fund', branch_id: 'branch-1', district_id: 'district-1', is_active: true }],
    financialYears: [{ id: 'fy-2026', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
    periods: [{ id: 'period-1', financial_year_id: 'fy-2026', name: 'Nov 2026', start_date: '2026-11-01', end_date: '2026-11-30', status: 'open', year_status: 'open' }],
    approvalPolicies: [
      { id: 'policy-1', name: 'Branch Policy', transaction_type: 'financial_document', branch_id: 'branch-1', version: 1, effective_from: '2026-01-01', is_active: true }
    ],
    approvalPolicyBands: [{ id: 'band-1', policy_id: 'policy-1', min_amount_base: 0, max_amount_base: null }],
    approvalPolicySteps: options?.twoStep
      ? [
          { id: 'step-1', band_id: 'band-1', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
          { id: 'step-2', band_id: 'band-1', step_number: 2, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
        ]
      : [
          { id: 'step-1', band_id: 'band-1', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
        ]
  };
}

describe('financeDocumentWorkflowService pending approvals', () => {
  test('filters pending receipts and payments and summarizes multi-currency totals', () => {
    const sampleDocs: FinanceWorkflowDocument[] = [
      {
        id: 'doc-1',
        document_number: 1,
        document_type: 'receipt',
        transaction_date: '2026-11-25',
        branch_id: 'branch-1',
        profile_id: 'officer',
        payee_or_payer_name: 'Grace Mensah',
        amount: 450,
        currency_code: 'SLE',
        payment_method: 'cash',
        fund_id: 'fund-1',
        external_reference: 'DEP-101',
        description: 'Sunday tithe deposit',
        status: 'pending_approval',
        journal_entry_id: null,
        approval_request_id: 'req-1',
        approval_status: 'pending',
        actor_approval_step_id: 'step-1',
        approval_steps_completed: 0,
        approval_steps_total: 1,
        approval_steps: []
      },
      {
        id: 'doc-2',
        document_number: 2,
        document_type: 'payment',
        transaction_date: '2026-11-25',
        branch_id: 'branch-1',
        profile_id: 'approver-1',
        payee_or_payer_name: 'EDSA Power',
        amount: 200,
        currency_code: 'USD',
        payment_method: 'bank_transfer',
        fund_id: 'fund-1',
        external_reference: 'INV-882',
        description: 'Generator fuel & electricity',
        status: 'pending_approval',
        journal_entry_id: null,
        approval_request_id: 'req-2',
        approval_status: 'pending',
        actor_approval_step_id: null,
        approval_steps_completed: 0,
        approval_steps_total: 1,
        approval_steps: []
      },
      {
        id: 'doc-3',
        document_number: 3,
        document_type: 'receipt',
        transaction_date: '2026-11-24',
        branch_id: 'branch-1',
        profile_id: 'officer',
        payee_or_payer_name: 'Completed Donor',
        amount: 1000,
        currency_code: 'SLE',
        payment_method: 'cash',
        fund_id: 'fund-1',
        external_reference: null,
        description: 'Already approved',
        status: 'approved',
        journal_entry_id: 'je-3',
        approval_request_id: 'req-3',
        approval_status: 'approved',
        actor_approval_step_id: null,
        approval_steps_completed: 1,
        approval_steps_total: 1,
        approval_steps: []
      }
    ];

    expect(filterPendingFinanceDocuments(sampleDocs, 'all').map(d => d.id)).toEqual(['doc-1', 'doc-2']);
    expect(filterPendingFinanceDocuments(sampleDocs, 'receipt').map(d => d.id)).toEqual(['doc-1']);
    expect(filterPendingFinanceDocuments(sampleDocs, 'payment').map(d => d.id)).toEqual(['doc-2']);
    expect(filterPendingFinanceDocuments(sampleDocs, 'actionable').map(d => d.id)).toEqual(['doc-1']);
    expect(filterPendingFinanceDocuments(sampleDocs, 'all', 'PAY-000002').map(d => d.id)).toEqual(['doc-2']);
    expect(filterPendingFinanceDocuments(sampleDocs, 'all', 'mensah').map(d => d.id)).toEqual(['doc-1']);

    const summary = summarizePendingFinanceDocuments(sampleDocs);
    expect(summary).toEqual({
      totalPending: 2,
      pendingReceipts: 1,
      pendingPayments: 1,
      awaitingMyDecision: 1,
      totalsByCurrency: [
        { currencyCode: 'SLE', totalAmount: 450, receiptAmount: 450, paymentAmount: 0 },
        { currencyCode: 'USD', totalAmount: 200, receiptAmount: 0, paymentAmount: 200 }
      ]
    });
  });

  test('requires a non-empty reason when rejecting and prevents RPC submission when missing', async () => {
    expect(validateApprovalDecisionReason('rejected', '   ')).toEqual({
      valid: false,
      message: 'Enter a rejection reason before rejecting this transaction.'
    });
    expect(validateApprovalDecisionReason('approved', '  ')).toEqual({
      valid: true,
      trimmedReason: null
    });
    expect(validateApprovalDecisionReason('rejected', ' Missing supporting receipt ')).toEqual({
      valid: true,
      trimmedReason: 'Missing supporting receipt'
    });

    let rpcCalled = false;
    const result = await submitFinanceApprovalDecision(
      { requestStepId: 'step-1', decision: 'rejected', reason: '   ' },
      {
        rpc: async () => {
          rpcCalled = true;
          return { data: null, error: null };
        }
      }
    );

    expect(rpcCalled).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });

  test('enforces authorization, self-approval prohibition, reason persistence, and multi-step workflow via RPC', async () => {
    let current = createWorkflowState({ twoStep: true });
    let authUserId: string | null = 'user-officer';
    const client = createMockFinanceRpc({
      load: () => structuredClone(current),
      save: next => { current = structuredClone(next); }
    }, () => ({ userId: authUserId }));

    const receipt = await createScopedFinancialDocumentTransaction({
      scope: { type: 'branch', id: 'branch-1' },
      documentType: 'receipt',
      transactionDate: '2026-11-25',
      partyName: 'Youth Fellowship',
      amount: 600,
      currencyCode: 'SLE',
      paymentMethod: 'cash',
      financialAccountId: 'cash-1',
      categoryAccountId: 'income-chart',
      fundId: 'fund-1',
      description: 'Thanksgiving offering',
      idempotencyKey: '00000000-0000-4000-8000-000000000101'
    }, client);

    const payment = await createScopedFinancialDocumentTransaction({
      scope: { type: 'branch', id: 'branch-1' },
      documentType: 'payment',
      transactionDate: '2026-11-25',
      partyName: 'Sound Vendor',
      amount: 320,
      currencyCode: 'SLE',
      paymentMethod: 'cash',
      financialAccountId: 'cash-1',
      categoryAccountId: 'expense-chart',
      fundId: 'fund-1',
      description: 'Microphone replacement',
      idempotencyKey: '00000000-0000-4000-8000-000000000102'
    }, client);

    expect(receipt.error).toBeNull();
    expect(payment.error).toBeNull();

    // Submitter sees pending documents but cannot self-approve
    const officerDocs = await getScopedFinanceWorkflowDocuments({ type: 'branch', id: 'branch-1' }, client);
    expect(officerDocs.data?.documents.every(d => d.actor_approval_step_id === null)).toBe(true);

    // Read-only viewer sees pending documents without actionable steps and cannot decide via RPC
    authUserId = 'user-viewer';
    const viewerDocs = await getScopedFinanceWorkflowDocuments({ type: 'branch', id: 'branch-1' }, client);
    expect(viewerDocs.data?.documents.every(d => d.actor_approval_step_id === null)).toBe(true);

    // Approver 1 loads pending approvals
    authUserId = 'user-approver-1';
    const approver1Docs = await getScopedFinanceWorkflowDocuments({ type: 'branch', id: 'branch-1' }, client);
    const pendingForApprover1 = filterPendingFinanceDocuments(approver1Docs.data?.documents || [], 'all');
    expect(pendingForApprover1).toHaveLength(2);

    const receiptDoc = pendingForApprover1.find(d => d.id === receipt.data!.document_id)!;
    const paymentDoc = pendingForApprover1.find(d => d.id === payment.data!.document_id)!;
    expect(receiptDoc.actor_approval_step_id).toBeTruthy();
    expect(paymentDoc.actor_approval_step_id).toBeTruthy();

    // Viewer attempting RPC call directly is rejected with 42501
    authUserId = 'user-viewer';
    const unauthorizedDecision = await submitFinanceApprovalDecision(
      { requestStepId: receiptDoc.actor_approval_step_id!, decision: 'approved', reason: 'Attempt bypass' },
      client
    );
    expect(unauthorizedDecision.error?.code).toBe('42501');

    // Approver 1 approves step 1 of receipt with reason and rejects payment with reason
    authUserId = 'user-approver-1';
    const step1Approve = await submitFinanceApprovalDecision(
      { requestStepId: receiptDoc.actor_approval_step_id!, decision: 'approved', reason: 'Verified teller slip' },
      client
    );
    expect(step1Approve.error).toBeNull();
    expect(step1Approve.data?.approval_status).toBe('pending');
    expect(step1Approve.data?.journal_entry_id).toBeNull();

    const rejectPayment = await submitFinanceApprovalDecision(
      { requestStepId: paymentDoc.actor_approval_step_id!, decision: 'rejected', reason: 'Missing signed vendor invoice' },
      client
    );
    expect(rejectPayment.error).toBeNull();
    expect(rejectPayment.data?.approval_status).toBe('rejected');

    // After step 1 approval and payment rejection, approver-1 can no longer act on receipt step 2
    const afterApprover1 = await getScopedFinanceWorkflowDocuments({ type: 'branch', id: 'branch-1' }, client);
    const stillPendingFor1 = filterPendingFinanceDocuments(afterApprover1.data?.documents || [], 'all');
    expect(stillPendingFor1).toHaveLength(1);
    expect(stillPendingFor1[0].id).toBe(receipt.data!.document_id);
    expect(stillPendingFor1[0].actor_approval_step_id).toBeNull();
    expect(stillPendingFor1[0].approval_steps[0].comments).toBe('Verified teller slip');

    const rejectedDoc = afterApprover1.data!.documents.find(d => d.id === payment.data!.document_id)!;
    expect(rejectedDoc.status).toBe('rejected');
    expect(rejectedDoc.journal_entry_id).toBeNull();
    expect(rejectedDoc.approval_steps[0].comments).toBe('Missing signed vendor invoice');

    // Approver 2 completes final approval step on receipt
    authUserId = 'user-approver-2';
    const approver2Docs = await getScopedFinanceWorkflowDocuments({ type: 'branch', id: 'branch-1' }, client);
    const pendingFor2 = filterPendingFinanceDocuments(approver2Docs.data?.documents || [], 'actionable');
    expect(pendingFor2).toHaveLength(1);

    const finalApprove = await submitFinanceApprovalDecision(
      { requestStepId: pendingFor2[0].actor_approval_step_id!, decision: 'approved', reason: 'Final treasury sign-off' },
      client
    );
    expect(finalApprove.error).toBeNull();
    expect(finalApprove.data?.approval_status).toBe('approved');
    expect(finalApprove.data?.journal_entry_id).toBe(receipt.data!.journal_entry_id);

    // Pending queue is now empty and both reasons are recorded in approval history
    const finalDocs = await getScopedFinanceWorkflowDocuments({ type: 'branch', id: 'branch-1' }, client);
    expect(filterPendingFinanceDocuments(finalDocs.data?.documents || [], 'all')).toHaveLength(0);
    const approvedReceipt = finalDocs.data!.documents.find(d => d.id === receipt.data!.document_id)!;
    expect(approvedReceipt.status).toBe('approved');
    expect(approvedReceipt.approval_steps.map(s => s.comments)).toEqual([
      'Verified teller slip',
      'Final treasury sign-off'
    ]);
  });
});

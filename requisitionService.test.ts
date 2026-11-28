import { describe, expect, test } from 'bun:test';
import type { DepartmentRequisition } from './types';
import {
  getRequisitionBlockedReason,
  getRequisitionRejectionReason,
  submitDepartmentRequisitionDecision,
  summarizeDepartmentRequisitions,
  type DepartmentRequisitionPaymentSummary
} from './requisitionService';

const makeRequisition = (overrides: Partial<DepartmentRequisition> = {}): DepartmentRequisition => ({
  id: 'req-1',
  requisition_number: 'REQ-2026-000001',
  branch_id: 'branch-1',
  department_name: 'Media & IT Ministry',
  applicant_profile_id: 'creator-1',
  applicant_name: 'David Koroma',
  title: 'Broadcast Camera Upgrade',
  description: 'Primary sanctuary broadcast camera',
  requested_amount: 5000,
  currency: 'SLE',
  priority: 'high',
  status: 'pending_approval',
  created_at: '2026-11-20T10:00:00.000Z',
  items: [{ id: 'item-1', item_name: '4K Camera', quantity: 1, unit_price: 5000, total_price: 5000 }],
  approval_steps: [
    {
      id: 'step-1',
      step_number: 1,
      required_permission_key: 'approve_requisitions',
      required_approvals: 1,
      prohibit_submitter_approval: true,
      status: 'pending',
      approvals_received: 0,
      actor_can_decide: true,
      decisions: []
    }
  ],
  ...overrides
});

describe('requisitionService workflow helpers', () => {
  test('requires a non-empty reason before rejecting and forwards approved decisions cleanly', async () => {
    let rpcCalls = 0;
    const mockClient = {
      rpc: async (name: string, args?: Record<string, unknown>) => {
        rpcCalls += 1;
        return {
          data: {
            requisition_id: 'req-1',
            approval_request_id: 'ar-1',
            approval_status: args?.p_decision === 'approved' ? 'approved' : 'rejected',
            status: args?.p_decision === 'approved' ? 'approved' : 'rejected',
            rpc_name: name,
            comments: args?.p_comments
          },
          error: null
        };
      }
    };

    const missingReason = await submitDepartmentRequisitionDecision(
      { requestStepId: 'step-1', decision: 'rejected', reason: '   ' },
      mockClient
    );
    expect(rpcCalls).toBe(0);
    expect(missingReason.error?.code).toBe('VALIDATION_ERROR');
    expect(missingReason.error?.message).toBe('Enter a rejection reason before rejecting this proposal.');

    const rejected = await submitDepartmentRequisitionDecision(
      { requestStepId: 'step-1', decision: 'rejected', reason: ' Missing vendor proforma quote ' },
      mockClient
    );
    expect(rpcCalls).toBe(1);
    expect(rejected.error).toBeNull();
    expect((rejected.data as any).comments).toBe('Missing vendor proforma quote');

    const approved = await submitDepartmentRequisitionDecision(
      { requestStepId: 'step-1', decision: 'approved' },
      mockClient
    );
    expect(rpcCalls).toBe(2);
    expect(approved.error).toBeNull();
  });

  test('summarizes counts, actionable queue, and multi-currency exposure across payment states', () => {
    const requisitions: DepartmentRequisition[] = [
      makeRequisition({ id: 'req-1', requested_amount: 3000, currency: 'SLE', status: 'pending_approval' }),
      makeRequisition({
        id: 'req-2',
        requested_amount: 450,
        currency: 'USD',
        status: 'pending_approval',
        approval_steps: [
          {
            id: 'step-2',
            step_number: 1,
            required_permission_key: 'approve_requisitions',
            required_approvals: 1,
            prohibit_submitter_approval: true,
            status: 'pending',
            approvals_received: 0,
            actor_can_decide: false,
            decisions: []
          }
        ]
      }),
      makeRequisition({ id: 'req-3', requested_amount: 12000, currency: 'SLE', status: 'approved' }),
      makeRequisition({ id: 'req-4', requested_amount: 2000, currency: 'SLE', status: 'rejected' })
    ];

    const summaries: DepartmentRequisitionPaymentSummary[] = [
      {
        requisition_id: 'req-3',
        requested_amount: 12000,
        currency_code: 'SLE',
        paid_amount: 4000,
        reserved_amount: 3000,
        remaining_amount: 5000,
        payment_status: 'partially_paid',
        payments: []
      }
    ];

    const result = summarizeDepartmentRequisitions(requisitions, summaries);
    expect(result).toEqual({
      total: 4,
      pendingApproval: 2,
      awaitingMyDecision: 1,
      approved: 1,
      rejected: 1,
      paidOrInPayment: 1,
      pendingTotalsByCurrency: [
        { currencyCode: 'SLE', totalAmount: 3000, count: 1 },
        { currencyCode: 'USD', totalAmount: 450, count: 1 }
      ],
      unpaidApprovedTotalsByCurrency: [{ currencyCode: 'SLE', totalAmount: 5000, count: 1 }]
    });
  });

  test('explains blocked actions and extracts rejection feedback', () => {
    const ownProposal = makeRequisition({ applicant_profile_id: 'user-1' });
    expect(getRequisitionBlockedReason(ownProposal, 'user-1', true)).toContain('Separation of duties');

    const alreadyDecided = makeRequisition({
      applicant_profile_id: 'other-user',
      approval_steps: [
        {
          id: 's1',
          step_number: 1,
          required_permission_key: 'approve_requisitions',
          required_approvals: 1,
          prohibit_submitter_approval: true,
          status: 'approved',
          approvals_received: 1,
          actor_can_decide: false,
          decisions: [{ approver_profile_id: 'user-2', decision: 'approved', comments: 'OK' }]
        },
        {
          id: 's2',
          step_number: 2,
          required_permission_key: 'approve_requisitions',
          required_approvals: 1,
          prohibit_submitter_approval: true,
          status: 'pending',
          approvals_received: 0,
          actor_can_decide: false,
          decisions: []
        }
      ]
    });
    expect(getRequisitionBlockedReason(alreadyDecided, 'user-2', true)).toContain('earlier approval level');
    expect(getRequisitionBlockedReason(makeRequisition({ applicant_profile_id: 'other' }), 'user-3', false)).toContain(
      'approve_requisitions permission'
    );

    const rejected = makeRequisition({
      status: 'rejected',
      approval_steps: [
        {
          id: 's1',
          step_number: 1,
          required_permission_key: 'approve_requisitions',
          required_approvals: 1,
          prohibit_submitter_approval: true,
          status: 'rejected',
          approvals_received: 0,
          actor_can_decide: false,
          decisions: [{ approver_profile_id: 'user-2', decision: 'rejected', comments: 'Exceeded Q4 budget' }]
        }
      ]
    });
    expect(getRequisitionRejectionReason(rejected)).toBe('Exceeded Q4 budget');
  });
});

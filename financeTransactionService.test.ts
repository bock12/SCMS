import { describe, expect, test } from 'bun:test';
import {
  createFinancialDocumentTransaction,
  decideFinancialDocumentApproval,
  type CreateFinancialDocumentTransactionInput
} from './financeTransactionService';

const baseInput: CreateFinancialDocumentTransactionInput = {
  documentType: 'receipt',
  transactionDate: '2026-11-17',
  branchId: 'branch-1',
  partyName: '  Grace Campbell  ',
  amount: 125,
  currencyCode: ' sll ',
  paymentMethod: 'mobile_money',
  financialAccountId: 'cash-account-1',
  categoryAccountId: 'income-account-1',
  externalReference: '  TX-100  ',
  description: '  Sunday offering  '
};

describe('finance transaction RPC service', () => {
  test('maps receipt input to the secure database RPC contract', async () => {
    let calledName = '';
    let calledArgs: Record<string, unknown> = {};
    const client = {
      async rpc(name: string, args: Record<string, unknown>) {
        calledName = name;
        calledArgs = args;
        return { data: { document_id: 'doc-1', journal_entry_id: 'journal-1', approval_request_id: 'approval-1', status: 'pending' }, error: null };
      }
    };

    const result = await createFinancialDocumentTransaction(baseInput, client as any);

    expect(calledName).toBe('create_financial_document_transaction');
    expect(calledArgs).toEqual({
      p_document_type: 'receipt',
      p_transaction_date: '2026-11-17',
      p_branch_id: 'branch-1',
      p_profile_id: null,
      p_party_name: 'Grace Campbell',
      p_amount: 125,
      p_currency_code: 'SLL',
      p_payment_method: 'mobile_money',
      p_financial_account_id: 'cash-account-1',
      p_category_account_id: 'income-account-1',
      p_fund_id: null,
      p_external_reference: 'TX-100',
      p_description: 'Sunday offering',
      p_exchange_rate_to_base: 1
    });
    expect(result.error).toBeNull();
    expect(result.data?.document_id).toBe('doc-1');
  });

  test('maps optional member, fund and foreign-currency values for a payment', async () => {
    let calledArgs: Record<string, unknown> = {};
    const client = {
      async rpc(_name: string, args: Record<string, unknown>) {
        calledArgs = args;
        return { data: null, error: { code: '42501', message: 'Permission denied' } };
      }
    };

    const result = await createFinancialDocumentTransaction({
      ...baseInput,
      documentType: 'payment',
      profileId: 'profile-1',
      fundId: 'fund-1',
      currencyCode: 'USD',
      exchangeRateToBase: 22.5,
      externalReference: ' ',
    }, client as any);

    expect(calledArgs.p_document_type).toBe('payment');
    expect(calledArgs.p_profile_id).toBe('profile-1');
    expect(calledArgs.p_fund_id).toBe('fund-1');
    expect(calledArgs.p_exchange_rate_to_base).toBe(22.5);
    expect(calledArgs.p_external_reference).toBeNull();
    expect(result.error?.code).toBe('42501');
  });

  test('routes approval decisions through the database workflow and normalizes comments', async () => {
    let calledName = '';
    let calledArgs: Record<string, unknown> = {};
    const client = {
      async rpc(name: string, args: Record<string, unknown>) {
        calledName = name;
        calledArgs = args;
        return { data: { document_id: 'doc-1', approval_request_id: 'request-1', journal_entry_id: null, approval_status: 'pending' }, error: null };
      }
    };

    await decideFinancialDocumentApproval({
      requestStepId: 'step-1',
      decision: 'approved',
      comments: '  Checked and verified  '
    }, client as any);

    expect(calledName).toBe('decide_financial_document_approval');
    expect(calledArgs).toEqual({
      p_request_step_id: 'step-1',
      p_decision: 'approved',
      p_comments: 'Checked and verified'
    });
  });
});

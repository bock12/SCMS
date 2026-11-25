import { describe, expect, test } from 'bun:test';
import {
  createFinancialTransfer,
  getFinancialTransfers,
  decideFinancialTransferApproval,
  postFinancialTransfer,
  setFinanceBranchClearingAccounts,
  type CreateFinancialTransferInput
} from './financeTransferService';

const input: CreateFinancialTransferInput = {
  transactionDate: '2026-11-25',
  sourceBranchId: 'branch-a',
  sourceFinancialAccountId: 'account-cash-a',
  destinationBranchId: 'branch-b',
  destinationFinancialAccountId: 'account-bank-b',
  amount: 250,
  currencyCode: 'sle',
  exchangeRateToBase: 1,
  description: 'Branch transfer',
  externalReference: 'TR-001',
  idempotencyKey: '00000000-0000-4000-8000-000000000001'
};

describe('financeTransferService', () => {
  test('maps same-branch and cross-branch transfer creation to the secure RPC', async () => {
    let name = '';
    let args: Record<string, unknown> = {};
    const client = { rpc: async (rpcName: string, rpcArgs: Record<string, unknown>) => {
      name = rpcName;
      args = rpcArgs;
      return { data: {
        transfer_id: 'transfer-1', transfer_number: 18,
        source_journal_entry_id: 'journal-a', destination_journal_entry_id: 'journal-b',
        source_approval_request_id: 'approval-a', destination_approval_request_id: 'approval-b',
        status: 'pending_approval'
      }, error: null };
    } };

    const result = await createFinancialTransfer(input, client);
    expect(name).toBe('create_financial_transfer');
    expect(args).toEqual({
      p_transaction_date: '2026-11-25',
      p_source_branch_id: 'branch-a',
      p_source_financial_account_id: 'account-cash-a',
      p_destination_branch_id: 'branch-b',
      p_destination_financial_account_id: 'account-bank-b',
      p_amount: 250,
      p_currency_code: 'SLE',
      p_exchange_rate_to_base: 1,
      p_description: 'Branch transfer',
      p_external_reference: 'TR-001',
      p_idempotency_key: input.idempotencyKey
    });
    expect(result.data?.transfer_id).toBe('transfer-1');
    expect(result.data?.status).toBe('pending_approval');
  });

  test('loads transfers by branch scope', async () => {
    let args: Record<string, unknown> = {};
    const client = { rpc: async (name: string, rpcArgs: Record<string, unknown>) => {
      expect(name).toBe('get_financial_transfers');
      args = rpcArgs;
      return { data: { actor_profile_id: 'profile-1', transfers: [] }, error: null };
    } };
    const result = await getFinancialTransfers('branch-a', client);
    expect(args).toEqual({ p_branch_id: 'branch-a' });
    expect(result.data?.transfers).toEqual([]);
  });

  test('maps branch approval decisions and optional comments', async () => {
    let args: Record<string, unknown> = {};
    const client = { rpc: async (name: string, rpcArgs: Record<string, unknown>) => {
      expect(name).toBe('decide_financial_transfer_approval');
      args = rpcArgs;
      return { data: { transfer_id: 'transfer-1', approval_request_id: 'request-1', approval_status: 'approved', status: 'approved' }, error: null };
    } };
    const result = await decideFinancialTransferApproval({
      requestStepId: 'step-1', decision: 'approved', comments: 'Reviewed'
    }, client);
    expect(args).toEqual({ p_request_step_id: 'step-1', p_decision: 'approved', p_comments: 'Reviewed' });
    expect(result.data?.status).toBe('approved');
  });

  test('posts the complete transfer through its atomic posting RPC', async () => {
    let args: Record<string, unknown> = {};
    const client = { rpc: async (name: string, rpcArgs: Record<string, unknown>) => {
      expect(name).toBe('post_financial_transfer');
      args = rpcArgs;
      return { data: { transfer_id: 'transfer-1', status: 'posted', already_posted: false, source_journal_entry_id: 'journal-a', destination_journal_entry_id: 'journal-b' }, error: null };
    } };
    const result = await postFinancialTransfer('transfer-1', client);
    expect(args).toEqual({ p_transfer_id: 'transfer-1' });
    expect(result.data?.status).toBe('posted');
    expect(result.data?.already_posted).toBe(false);
  });

  test('saves explicit due-from and due-to clearing-account configuration', async () => {
    let args: Record<string, unknown> = {};
    const client = { rpc: async (name: string, rpcArgs: Record<string, unknown>) => {
      expect(name).toBe('set_finance_branch_clearing_accounts');
      args = rpcArgs;
      return { data: { saved: true, branch_id: 'branch-a' }, error: null };
    } };
    const result = await setFinanceBranchClearingAccounts({
      branchId: 'branch-a', dueFromChartAccountId: 'asset-due-from', dueToChartAccountId: 'liability-due-to'
    }, client);
    expect(args).toEqual({
      p_branch_id: 'branch-a',
      p_due_from_chart_account_id: 'asset-due-from',
      p_due_to_chart_account_id: 'liability-due-to'
    });
    expect(result.data?.saved).toBe(true);
  });

  test('preserves RPC authorization errors', async () => {
    const client = { rpc: async () => ({ data: null, error: { code: '42501', message: 'Insufficient branch permission' } }) };
    const result = await createFinancialTransfer(input, client);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('42501');
  });
});

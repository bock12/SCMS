import { describe, expect, test } from 'bun:test';
import { getFinanceTransferReconciliation } from './financeTransferReconciliationService';

describe('financeTransferReconciliationService', () => {
  test('requests transfer reconciliation for the selected organizational scope', async () => {
    let rpcName = '';
    let args: Record<string, unknown> = {};
    const client = {
      rpc: async (name: string, rpcArgs: Record<string, unknown>) => {
        rpcName = name;
        args = rpcArgs;
        return {
          data: {
            actor_profile_id: 'profile-a',
            scope_type: 'church',
            scope_id: null,
            transfers: [],
            clearing_summary: []
          },
          error: null
        };
      }
    };
    const result = await getFinanceTransferReconciliation({ type: 'church', id: null }, client);
    expect(rpcName).toBe('get_finance_transfer_reconciliation');
    expect(args).toEqual({ p_scope_type: 'church', p_scope_id: null });
    expect(result.data?.transfers).toEqual([]);
    expect(result.data?.clearing_summary).toEqual([]);
  });

  test('preserves authorization errors from the database RPC', async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { message: 'Insufficient permission to view transfer reconciliation in this branch', code: '42501' }
      })
    };
    const result = await getFinanceTransferReconciliation({ type: 'branch', id: 'branch-a' }, client);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('42501');
  });
});

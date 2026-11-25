import { expect, test } from '@playwright/test';

test.describe('SCMS finance browser smoke', () => {
  test('authorized finance user can open the transaction workspace', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('Quick 1-Click Demo Accounts')).toBeVisible();
    await page.getByRole('button', { name: /Sarah Johnson/ }).click();
    await expect(page).toHaveURL(/\/portal(?:\/|$)/);
    await expect(page.getByText('Church Overview').first()).toBeVisible();

    // Resolve the signed-in profile from the mock auth session instead of
    // assuming that the selected demo account always uses a fixed profile ID.
    // Seed the complete authorization relationship in this isolated browser DB.
    await page.evaluate(() => {
      const databaseKey = 'faithconnect_db_v2';
      const sessionKey = 'faithconnect_auth_session_v2';
      const rawDatabase = localStorage.getItem(databaseKey);
      const rawSession = localStorage.getItem(sessionKey);
      if (!rawDatabase || !rawSession) throw new Error('Mock database or auth session was not initialized.');
      const database = JSON.parse(rawDatabase);
      const session = JSON.parse(rawSession);
      const authUserId = session.user?.id;
      const actor = (database.profiles || []).find((profile: { auth_user_id?: string; id: string }) =>
        profile.auth_user_id === authUserId || profile.id === authUserId
      );
      if (!actor) throw new Error(`No church profile found for signed-in mock user ${authUserId || '(unknown)'}.`);

      database.roles = Array.isArray(database.roles) ? database.roles : [];
      database.permissions = Array.isArray(database.permissions) ? database.permissions : [];
      database.role_permissions = Array.isArray(database.role_permissions) ? database.role_permissions : [];
      database.profile_role_assignments = Array.isArray(database.profile_role_assignments)
        ? database.profile_role_assignments
        : [];

      let financeRole = database.roles.find((role: { name?: string }) => role.name === 'finance_officer');
      if (!financeRole) {
        financeRole = { id: 'pw-finance-officer-role', name: 'finance_officer', is_active: true };
        database.roles.push(financeRole);
      }
      financeRole.is_active = true;

      for (const key of ['view_finances', 'manage_finances', 'post_journals']) {
        let permission = database.permissions.find((item: { key?: string }) => item.key === key);
        if (!permission) {
          permission = { id: `pw-${key}`, key };
          database.permissions.push(permission);
        }
        if (!database.role_permissions.some((link: { role_id: string; permission_id: string }) =>
          link.role_id === financeRole.id && link.permission_id === permission.id
        )) {
          database.role_permissions.push({ role_id: financeRole.id, permission_id: permission.id });
        }
      }

      database.profile_role_assignments = database.profile_role_assignments.filter(
        (item: { id?: string }) => item.id !== 'pw-finance-officer-assignment'
      );
      database.profile_role_assignments.push({
        id: 'pw-finance-officer-assignment',
        profile_id: actor.id,
        role_id: financeRole.id,
        scope_type: 'church',
        branch_id: null,
        district_id: null,
        assigned_by_profile_id: actor.id,
        assigned_at: new Date(Date.now() - 1000).toISOString(),
        expires_at: null,
        is_active: true
      });
      localStorage.setItem(databaseKey, JSON.stringify(database));

      // Seed only the isolated canonical finance store so this browser test
      // exercises the real receipt form -> mock RPC -> approval/journal path.
      const financeState = {
        profiles: [], ministries: [], requisitions: [], requisitionItems: [],
        branches: [{ id: actor.branch_id, district_id: null, name: 'Main Branch', status: 'active' }], districts: [],
        currencies: ['SLL'], baseCurrencyCode: 'SLL',
        permissions: [
          { profile_id: actor.id, permission: 'view_finances', branch_id: null },
          { profile_id: actor.id, permission: 'manage_finances', branch_id: null },
          { profile_id: actor.id, permission: 'post_journals', branch_id: null }
        ],
        financialAccounts: [
          {
            id: 'pw-cash-account', branch_id: actor.branch_id, name: 'Browser Test Cash',
            account_type: 'cash', currency_code: 'SLL', is_active: true, chart_account_id: 'pw-cash-chart'
          },
          {
            id: 'pw-bank-account', branch_id: actor.branch_id, name: 'Browser Test Bank',
            account_type: 'bank', currency_code: 'SLL', is_active: true, chart_account_id: 'pw-bank-chart'
          }
        ],
        chartAccounts: [
          { id: 'pw-cash-chart', code: '1000', name: 'Cash', account_type: 'asset', is_active: true, is_control_account: false },
          { id: 'pw-bank-chart', code: '1010', name: 'Bank', account_type: 'asset', is_active: true, is_control_account: false },
          { id: 'pw-income-chart', code: '4000', name: 'Offering Income', account_type: 'income', is_active: true, is_control_account: false },
          { id: 'pw-expense-chart', code: '5000', name: 'Operating Expense', account_type: 'expense', is_active: true, is_control_account: false }
        ],
        funds: [], periods: [{
          id: 'pw-period', financial_year_id: 'pw-year', name: '2026',
          start_date: '2026-01-01', end_date: '2026-12-31', status: 'open', year_status: 'open'
        }],
        financialYears: [{
          id: 'pw-year', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open'
        }],
        approvalPolicyBands: [
          { id: 'pw-band', policy_id: 'pw-policy', min_amount_base: 0, max_amount_base: null },
          { id: 'pw-transfer-band', policy_id: 'pw-transfer-policy', min_amount_base: 0, max_amount_base: null }
        ],
        approvalPolicySteps: [
          { id: 'pw-step-1', band_id: 'pw-band', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
          { id: 'pw-step-2', band_id: 'pw-band', step_number: 2, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
        ],
        approvalPolicies: [
          {
            id: 'pw-policy', name: 'Browser Test Approval', transaction_type: 'financial_document',
            branch_id: actor.branch_id, version: 1, effective_from: '2026-01-01', is_active: true
          },
          {
            id: 'pw-transfer-policy', name: 'Browser Test Transfer Approval', transaction_type: 'financial_transfer',
            branch_id: actor.branch_id, version: 1, effective_from: '2026-01-01', is_active: true
          }
        ],
        events: [], budgets: [], budgetLines: [], documents: [], journals: [],
        journalLines: [], approvalRequests: [], approvalSteps: [], approvalDecisions: [], nextId: 1
      };
      localStorage.setItem('scms_mock_finance_v2', JSON.stringify(financeState));
    });

    await page.reload();
    await expect(page.getByText('Church Overview').first()).toBeVisible();
    // The app uses HashRouter, so direct browser navigation must target the route inside the URL hash.
    await page.goto('/#/portal/finance?tab=ledger');
    console.log('FINANCE_BROWSER_ROUTE:', { url: page.url(), location: await page.evaluate(() => ({ pathname: window.location.pathname, search: window.location.search })) });
    console.log('FINANCE_BROWSER_PAGE:', (await page.locator('body').innerText()).slice(0, 1800));
    console.log('FINANCE_BROWSER_AUTHZ:', await page.evaluate(() => {
      const database = JSON.parse(localStorage.getItem('faithconnect_db_v2') || '{}');
      const session = JSON.parse(localStorage.getItem('faithconnect_auth_session_v2') || '{}');
      const actor = (database.profiles || []).find((profile: { auth_user_id?: string; id: string }) =>
        profile.auth_user_id === session.user?.id || profile.id === session.user?.id
      );
      return {
        sessionUserId: session.user?.id,
        actor: actor ? { id: actor.id, branch_id: actor.branch_id } : null,
        roles: (database.roles || []).filter((role: { name?: string }) => role.name === 'finance_officer'),
        assignments: (database.profile_role_assignments || []).filter((item: { id?: string }) => item.id === 'pw-finance-officer-assignment'),
        permissions: (database.permissions || []).filter((item: { key?: string }) => ['view_finances', 'manage_finances'].includes(item.key || '')),
        financeRoleLinks: (database.role_permissions || []).filter((link: { role_id?: string; permission_id?: string }) => link.role_id === 'mock-role-finance-officer')
      };
    }));
    await expect(page.getByText('Receipt & payment entry')).toBeVisible({ timeout: 15000 });
    const createReceipt = page.getByRole('button', { name: 'Create receipt' });
    await expect(createReceipt).toBeVisible();
    await expect(createReceipt).toBeEnabled();

    await page.getByPlaceholder('Person or organisation').fill('Browser Test Offering');
    // The visible label includes a required marker that is not part of the input's accessible name.
    // Amount is the first numeric input; the exchange-rate input follows it.
    await page.getByRole('spinbutton').first().fill('125');
    await page.getByPlaceholder('Purpose or details of this transaction').fill('Browser smoke test receipt');
    await createReceipt.click();

    await expect(page.getByRole('status').filter({ hasText: 'Financial document created' })).toBeVisible();
    const transactionState = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('scms_mock_finance_v2') || '{}');
      return {
        documents: state.documents || [],
        journals: state.journals || [],
        journalLines: state.journalLines || [],
        approvalRequests: state.approvalRequests || []
      };
    });
    expect(transactionState.documents).toHaveLength(1);
    expect(transactionState.documents[0].document_type).toBe('receipt');
    expect(transactionState.documents[0].status).toBe('pending_approval');
    expect(transactionState.journals).toHaveLength(1);
    expect(transactionState.journals[0].source_type).toBe('financial_document_pending');
    expect(transactionState.journalLines).toHaveLength(2);
    expect(transactionState.journalLines.reduce((sum: number, line: any) => sum + line.debit_amount, 0)).toBe(125);
    expect(transactionState.journalLines.reduce((sum: number, line: any) => sum + line.credit_amount, 0)).toBe(125);

    expect(transactionState.approvalRequests).toHaveLength(1);

    // Exercise the payment side of the same real entry workspace. The adapter
    // must create a separate pending document and balanced draft journal.
    await page.getByRole('button', { name: 'Payment', exact: true }).click();
    await expect(page.getByPlaceholder('Person or organisation')).toBeVisible();
    await page.getByPlaceholder('Person or organisation').fill('Browser Test Supplier');
    await page.getByRole('spinbutton').first().fill('80');
    await page.getByPlaceholder('Purpose or details of this transaction').fill('Browser smoke test payment');
    await page.getByRole('button', { name: 'Create payment', exact: true }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Financial document created' })).toBeVisible();
    const paymentState = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('scms_mock_finance_v2') || '{}');
      return {
        documents: state.documents || [],
        journals: state.journals || [],
        journalLines: state.journalLines || [],
        approvalRequests: state.approvalRequests || []
      };
    });
    expect(paymentState.documents).toHaveLength(2);
    expect(paymentState.documents.map((document: any) => document.document_type).sort()).toEqual(['payment', 'receipt']);
    expect(paymentState.documents.every((document: any) => document.status === 'pending_approval')).toBe(true);
    expect(paymentState.journals).toHaveLength(2);
    expect(paymentState.journals.every((journal: any) => journal.source_type === 'financial_document_pending')).toBe(true);
    expect(paymentState.journalLines).toHaveLength(4);
    for (const amount of [125, 80]) {
      const lines = paymentState.journalLines.filter((line: any) => line.debit_amount === amount || line.credit_amount === amount);
      expect(lines.reduce((sum: number, line: any) => sum + line.debit_amount, 0)).toBe(amount);
      expect(lines.reduce((sum: number, line: any) => sum + line.credit_amount, 0)).toBe(amount);
    }

    expect(paymentState.approvalRequests).toHaveLength(2);

    // Prepare two distinct approver identities from the isolated mock directory.
    // Their approval authority is granted in both the app's role-resolution
    // fixture and the canonical finance RPC fixture.
    const approverIds = await page.evaluate(() => {
      const databaseKey = 'faithconnect_db_v2';
      const financeKey = 'scms_mock_finance_v2';
      const database = JSON.parse(localStorage.getItem(databaseKey) || '{}');
      const session = JSON.parse(localStorage.getItem('faithconnect_auth_session_v2') || '{}');
      const submitter = (database.profiles || []).find((profile: any) =>
        profile.auth_user_id === session.user?.id || profile.id === session.user?.id
      );
      if (!submitter) throw new Error('Submitter profile was not found.');
      const candidates = (database.profiles || []).filter((profile: any) =>
        profile.id !== submitter.id && profile.auth_user_id && profile.branch_id === submitter.branch_id &&
        !['suspended', 'archived'].includes(profile.status)
      );
      if (candidates.length < 2) throw new Error('Two additional active profiles in the submitter branch are required for browser approval coverage.');

      const financeState = JSON.parse(localStorage.getItem(financeKey) || '{}');
      financeState.profiles = (database.profiles || []).map((profile: any) => ({
        id: profile.id, auth_user_id: profile.auth_user_id || null,
        status: profile.status, branch_id: profile.branch_id,
        first_name: profile.first_name, last_name: profile.last_name
      }));
      financeState.permissions = financeState.permissions || [];
      for (const candidate of candidates.slice(0, 2)) {
        financeState.permissions = financeState.permissions.filter((item: any) =>
          !(item.profile_id === candidate.id && item.permission === 'approve_finances')
        );
        financeState.permissions.push({
          profile_id: candidate.id, permission: 'approve_finances', branch_id: submitter.branch_id
        });
      }
      localStorage.setItem(financeKey, JSON.stringify(financeState));

      const roles = database.roles || [];
      const financeRole = roles.find((role: any) => role.name === 'finance_officer');
      if (!financeRole) throw new Error('Finance role fixture is missing.');
      database.permissions = database.permissions || [];
      database.role_permissions = database.role_permissions || [];
      let approvePermission = database.permissions.find((item: any) => item.key === 'approve_finances');
      if (!approvePermission) {
        approvePermission = { id: 'pw-approve-finances', key: 'approve_finances' };
        database.permissions.push(approvePermission);
      }
      for (const key of ['view_finances', 'manage_finances', 'approve_finances']) {
        const permission = database.permissions.find((item: any) => item.key === key);
        if (permission && !database.role_permissions.some((link: any) =>
          link.role_id === financeRole.id && link.permission_id === permission.id
        )) database.role_permissions.push({ role_id: financeRole.id, permission_id: permission.id });
      }
      database.profile_role_assignments = database.profile_role_assignments || [];
      for (const candidate of candidates.slice(0, 2)) {
        database.profile_role_assignments = database.profile_role_assignments.filter((item: any) =>
          !(item.profile_id === candidate.id && item.role_id === financeRole.id)
        );
        database.profile_role_assignments.push({
          id: `pw-approver-${candidate.id}`, profile_id: candidate.id,
          role_id: financeRole.id, scope_type: 'branch', branch_id: submitter.branch_id,
          district_id: null, assigned_by_profile_id: submitter.id,
          assigned_at: new Date(Date.now() - 1000).toISOString(), expires_at: null, is_active: true
        });
      }
      localStorage.setItem(databaseKey, JSON.stringify(database));
      return candidates.slice(0, 2).map((profile: any) => ({
        id: profile.id, authUserId: profile.auth_user_id
      }));
    });

    const switchToApprover = async (index: number) => {
      await page.evaluate((authUserId: string) => {
        const key = 'faithconnect_auth_session_v2';
        const session = JSON.parse(localStorage.getItem(key) || '{}');
        session.user = { ...(session.user || {}), id: authUserId };
        localStorage.setItem(key, JSON.stringify(session));
      }, approverIds[index].authUserId);
      await page.reload();
      await page.goto('/#/portal/finance?tab=ledger');
      await expect(page.getByText('Financial documents & approvals')).toBeVisible();
    };

    await switchToApprover(0);
    const receiptCard = page.locator('article').filter({ hasText: 'Browser Test Offering' }).first();
    await expect(receiptCard.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await receiptCard.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Approval decision recorded' })).toBeVisible();
    await expect(receiptCard.getByText('Approval progress: 1/2 steps approved')).toBeVisible();

    await switchToApprover(1);
    const secondReceiptCard = page.locator('article').filter({ hasText: 'Browser Test Offering' }).first();
    await expect(secondReceiptCard.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await secondReceiptCard.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Document approved' })).toBeVisible();
    const approvedReceiptState = await page.evaluate(() => JSON.parse(localStorage.getItem('scms_mock_finance_v2') || '{}'));
    const approvedReceipt = approvedReceiptState.documents.find((document: any) => document.payee_or_payer_name === 'Browser Test Offering');
    const approvedReceiptJournal = approvedReceiptState.journals.find((journal: any) => journal.id === approvedReceipt.journal_entry_id);
    expect(approvedReceipt.status).toBe('approved');
    expect(approvedReceipt.journal_entry_id).toBeTruthy();
    expect(approvedReceiptJournal.source_type).toBe('financial_document');

    // The second document follows the rejection branch. It must remain
    // unlinked and its pending journal must never become postable.
    const paymentCard = page.locator('article').filter({ hasText: 'Browser Test Supplier' }).first();
    await expect(paymentCard.getByRole('button', { name: 'Reject', exact: true })).toBeVisible();
    await paymentCard.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Document rejected' })).toBeVisible();
    const finalFinanceState = await page.evaluate(() => JSON.parse(localStorage.getItem('scms_mock_finance_v2') || '{}'));
    const rejectedPayment = finalFinanceState.documents.find((document: any) => document.payee_or_payer_name === 'Browser Test Supplier');
    const rejectedJournal = finalFinanceState.journals.find((journal: any) => journal.source_id === rejectedPayment.id);
    expect(rejectedPayment.status).toBe('rejected');
    expect(rejectedPayment.journal_entry_id).toBeFalsy();
    expect(rejectedJournal.status).toBe('draft');
    expect(rejectedJournal.source_type).toBe('financial_document_pending');

    // Return to the submitting Finance Officer and verify that approved,
    // pending and rejected journals are excluded from posted balances/reports.
    await page.evaluate(() => {
      const database = JSON.parse(localStorage.getItem('faithconnect_db_v2') || '{}');
      const assignment = (database.profile_role_assignments || []).find((item: any) =>
        item.id === 'pw-finance-officer-assignment'
      );
      const actor = (database.profiles || []).find((profile: any) => profile.id === assignment?.profile_id);
      if (!actor?.auth_user_id) throw new Error('Submitting Finance Officer session could not be restored.');
      const key = 'faithconnect_auth_session_v2';
      const session = JSON.parse(localStorage.getItem(key) || '{}');
      session.user = { ...(session.user || {}), id: actor.auth_user_id };
      localStorage.setItem(key, JSON.stringify(session));
    });
    await page.reload();
    await page.goto('/#/portal/finance?tab=ledger');
    await expect(page.getByText('Journal register & posted ledger balances')).toBeVisible();

    const prePostingState = await page.evaluate(() => JSON.parse(localStorage.getItem('scms_mock_finance_v2') || '{}'));
    const approvedReceiptBeforePosting = prePostingState.documents.find((document: any) =>
      document.payee_or_payer_name === 'Browser Test Offering'
    );
    expect(approvedReceiptBeforePosting.status).toBe('approved');
    expect(prePostingState.journals.find((journal: any) => journal.id === approvedReceiptBeforePosting.journal_entry_id).status).toBe('draft');
    await expect(page.getByText('No posted journal lines exist in this scope. Approved and pending drafts are excluded.')).toBeVisible();
    await expect(page.getByText('No posted transactions are available for this reporting period.')).toBeVisible();

    // There is exactly one approved, postable journal in this fixture; target the
    // visible action directly rather than relying on nested article markup.
    const postJournalButton = page.getByRole('button', { name: 'Post journal', exact: true });
    await expect(postJournalButton).toBeVisible();

    // Posting is a separate authorized action. Only after this click should
    // the receipt enter the ledger balances and posted financial report.
    await postJournalButton.click();
    await expect(page.getByRole('status').filter({ hasText: 'Journal posted successfully' })).toBeVisible();
    await expect(page.getByText('SLL 125.00').first()).toBeVisible();

    const postedState = await page.evaluate(() => JSON.parse(localStorage.getItem('scms_mock_finance_v2') || '{}'));
    const postedReceipt = postedState.documents.find((document: any) => document.payee_or_payer_name === 'Browser Test Offering');
    const postedReceiptJournal = postedState.journals.find((journal: any) => journal.id === postedReceipt.journal_entry_id);
    const stillRejectedPayment = postedState.documents.find((document: any) => document.payee_or_payer_name === 'Browser Test Supplier');
    const stillRejectedJournal = postedState.journals.find((journal: any) => journal.source_id === stillRejectedPayment.id);
    expect(postedReceipt.status).toBe('posted');
    expect(postedReceiptJournal.status).toBe('posted');
    expect(postedReceiptJournal.source_type).toBe('financial_document');
    expect(stillRejectedPayment.status).toBe('rejected');
    expect(stillRejectedJournal.status).toBe('draft');
    expect(stillRejectedJournal.source_type).toBe('financial_document_pending');
    expect(postedState.journals.filter((journal: any) => journal.status === 'posted')).toHaveLength(1);

    // Open the canonical receipt detail and exercise its print action without
    // launching a native print dialog in CI.
    const postedReceiptCard = page.locator('article').filter({ hasText: 'Browser Test Offering' }).first();
    await postedReceiptCard.getByRole('button', { name: 'View details' }).click();
    const detailDialog = page.getByRole('dialog', { name: 'Financial document detail' });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByRole('heading', { name: 'REC-000001' })).toBeVisible();
    await expect(detailDialog.getByText('OFFICIAL RECEIPT')).toBeVisible();
    await expect(detailDialog.getByText('Browser smoke test receipt')).toBeVisible();
    await page.evaluate(() => {
      (window as any).__financePrintCalled = false;
      window.print = () => { (window as any).__financePrintCalled = true; };
    });
    await detailDialog.getByRole('button', { name: 'Print' }).click();
    expect(await page.evaluate(() => (window as any).__financePrintCalled)).toBe(true);

    // Exercise the dedicated same-branch transfer workspace. This must create
    // a balance-sheet journal (not a receipt/payment or income/expense record)
    // and require the atomic transfer-posting action.
    await page.goto('/#/portal/finance?tab=transfers');
    await expect(page.getByText('Internal financial transfers')).toBeVisible();
    await expect(page.getByText('Record a transfer')).toBeVisible();
    await page.getByRole('spinbutton').first().fill('75');
    await page.getByPlaceholder('Reason for the internal transfer').fill('Move cash into the bank account');
    await page.getByRole('button', { name: 'Submit transfer', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Transfer created and approved' })).toBeVisible();

    const transferDraftState = await page.evaluate(() => JSON.parse(localStorage.getItem('scms_mock_finance_v2') || '{}'));
    expect(transferDraftState.transfers).toHaveLength(1);
    expect(transferDraftState.transfers[0].status).toBe('approved');
    expect(transferDraftState.transfers[0].destination_journal_entry_id).toBeNull();
    const transferJournal = transferDraftState.journals.find((journal: any) =>
      journal.id === transferDraftState.transfers[0].source_journal_entry_id
    );
    const transferLines = transferDraftState.journalLines.filter((line: any) =>
      line.journal_entry_id === transferJournal.id
    );
    expect(transferJournal.source_type).toBe('financial_transfer');
    expect(transferLines).toHaveLength(2);
    expect(transferLines.find((line: any) => line.account_id === 'pw-bank-chart')?.debit_amount).toBe(75);
    expect(transferLines.find((line: any) => line.account_id === 'pw-cash-chart')?.credit_amount).toBe(75);

    await page.getByRole('button', { name: 'Post transfer atomically' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Transfer posted' })).toBeVisible();
    const transferPostedState = await page.evaluate(() => JSON.parse(localStorage.getItem('scms_mock_finance_v2') || '{}'));
    expect(transferPostedState.transfers[0].status).toBe('posted');
    expect(transferPostedState.journals.find((journal: any) => journal.id === transferJournal.id).status).toBe('posted');

  });
});

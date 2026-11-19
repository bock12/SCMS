import { expect, test } from '@playwright/test';

test.describe('SCMS finance browser smoke', () => {
  test('authorized finance user can open the transaction workspace', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('Quick 1-Click Demo Accounts')).toBeVisible();
    await page.getByRole('button', { name: /Pastor David/ }).click();
    await expect(page).toHaveURL(/\\/portal(?:\\/|$)/);
    await expect(page.getByText('Church Overview').first()).toBeVisible();

    // The built-in demo admin is not guaranteed to carry the finance role in
    // persisted mock data. Give this isolated browser context an explicit,
    // church-scoped finance-officer assignment as deterministic test setup.
    await page.evaluate(() => {
      const storageKey = 'faithconnect_db_v2';
      const raw = localStorage.getItem(storageKey);
      if (!raw) throw new Error('Mock database was not initialized after demo sign-in.');
      const database = JSON.parse(raw);
      const assignments = Array.isArray(database.profile_role_assignments)
        ? database.profile_role_assignments
        : [];
      database.profile_role_assignments = [
        ...assignments.filter((item: { id?: string }) => item.id !== 'pw-finance-officer-assignment'),
        {
          id: 'pw-finance-officer-assignment',
          profile_id: 'usr-admin-1',
          role_id: 'mock-role-finance-officer',
          scope_type: 'church',
          branch_id: null,
          district_id: null,
          assigned_by_profile_id: 'usr-admin-1',
          assigned_at: new Date().toISOString(),
          expires_at: null,
          is_active: true
        }
      ];
      localStorage.setItem(storageKey, JSON.stringify(database));
    });

    await page.reload();
    await expect(page.getByText('Church Overview').first()).toBeVisible();
    await page.goto('/portal/finance?tab=ledger');
    await expect(page.getByText('Receipt & payment entry')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Create receipt' })).toBeVisible();
  });
});

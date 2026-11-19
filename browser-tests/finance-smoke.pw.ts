import { expect, test } from '@playwright/test';

test.describe('SCMS finance browser smoke', () => {
  test('demo administrator can sign in and open the finance transaction workspace', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('Quick 1-Click Demo Accounts')).toBeVisible();

    await page.getByRole('button', { name: /Pastor David/ }).click();
    await expect(page).toHaveURL(/\/portal(?:\/|$)/);
    await expect(page.getByText('Church Overview').first()).toBeVisible();

    await page.goto('/portal/finance?tab=ledger');
    await expect(page.getByText('Receipt & payment entry')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Create receipt' })).toBeVisible();
  });
});

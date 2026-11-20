import { expect, test } from '@playwright/test';

test.describe('SCMS finance browser smoke', () => {
  test('authorized finance user can open the transaction workspace', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('Quick 1-Click Demo Accounts')).toBeVisible();
    await page.getByRole('button', { name: /Pastor David/ }).click();
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

      for (const key of ['view_finances', 'manage_finances']) {
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
    });

    await page.reload();
    await expect(page.getByText('Church Overview').first()).toBeVisible();
    await page.goto('/portal/finance?tab=ledger');
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
    await expect(page.getByRole('button', { name: 'Create receipt' })).toBeVisible();
  });
});

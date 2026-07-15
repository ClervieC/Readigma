import { test, expect } from '@playwright/test';
import { login, E2E_EMAIL } from './utils';

test.describe('Auth', () => {
  test('logs in with valid credentials and lands on Découvrir', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/$|\/index/);
    await expect(page.getByText('Découvrir', { exact: true })).toBeVisible();
  });

  test('shows an error for wrong credentials', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('ton@email.com').fill(E2E_EMAIL);
    await page.getByPlaceholder('••••••••').fill('definitely-not-the-password');
    await page.getByText('Se connecter').click();
    // Errors surface via Alert.alert, which RN Web renders as window.alert —
    // Playwright auto-dismisses those, but the login screen itself must
    // still be showing (no navigation happened).
    page.once('dialog', dialog => dialog.dismiss());
    await expect(page.getByText('Bon retour')).toBeVisible({ timeout: 10_000 });
  });

  test('rejects an empty form without calling the API', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Se connecter').click();
    page.once('dialog', dialog => dialog.dismiss());
    await expect(page.getByText('Bon retour')).toBeVisible();
  });
});

// Sanity check that the shared credentials actually resolve to a non-admin
// account, so admin-gated specs elsewhere don't accidentally pass for the
// wrong reason.
test('the e2e account is a regular (non-admin) user', async ({ page }) => {
  await login(page);
  await page.goto('/profile');
  await expect(page.getByText('Admin', { exact: true })).toHaveCount(0);
});
